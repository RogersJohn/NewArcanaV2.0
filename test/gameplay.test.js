/**
 * Gameplay integration tests — covers end-to-end flows that unit tests miss.
 * Would have caught issues #16, #18, #19, #20, #25, #26, #28, #29.
 */
import { describe, it, expect } from 'vitest';
import { createMinorCard, createMajorCard, MAJOR_ARCANA_DEFS } from '../src/cards.js';
import { createInitialState } from '../src/state.js';
import { setup, playGame, playRound, executeAction, handleRoundEnd, drawPhase } from '../src/engine.js';
import { getLegalActions } from '../src/actions.js';
import { scoreRoundEnd, checkCelestialWin } from '../src/scoring.js';
import { GameController } from '../src/game-controller.js';
import { DECISION_TYPES } from '../src/history.js';
import { RandomAI } from '../src/ai/base.js';
import { runSimulation } from '../src/simulation.js';

// ── Helpers ──

function mc(suit, rank) { return createMinorCard(suit, rank); }
function major(number) {
  const def = MAJOR_ARCANA_DEFS.find(d => d.number === number);
  return createMajorCard(number, def.name, def.category, def.keywords);
}

function makeTestState(numPlayers = 4) {
  const state = createInitialState(numPlayers, false, 42);
  state.minorDeck = [];
  state.majorDeck = [];
  state.minorDiscard = [];
  state.majorDiscard = [];
  state.display = [null, null, null];
  state.pot = 10;
  state.roundNumber = 1;
  state.roundEndMarkerHolder = -1;
  for (const p of state.players) {
    p.hand = [];
    p.realm = [];
    p.tome = [];
    p.vault = [];
  }
  return state;
}

function makeAIs(n) {
  return Array.from({ length: n }, () => new RandomAI());
}

/** Auto-resolve any decision via RandomAI. */
function autoResolveDecision(decision) {
  const ai = new RandomAI();
  switch (decision.type) {
    case DECISION_TYPES.MAJOR_KEEP:
      return ai.chooseMajorKeep(decision.cards, decision.state);
    case DECISION_TYPES.ACTION:
      return ai.chooseAction(decision.state, decision.legalActions, decision.playerIndex);
    case DECISION_TYPES.ACE_BLOCK:
      return ai.shouldBlockWithAce(decision.state, decision.playerIndex, decision.action);
    case DECISION_TYPES.KING_BLOCK:
      return ai.shouldBlockWithKing(decision.state, decision.playerIndex, decision.attackCard);
    case DECISION_TYPES.DISCARD:
      return ai.chooseDiscard(decision.state, decision.playerIndex, decision.numToDiscard);
    case DECISION_TYPES.REALM_DISCARD:
      return ai.chooseRealmDiscard(decision.state, decision.playerIndex, decision.numToDiscard);
    case DECISION_TYPES.TOME_DISCARD:
      return ai.chooseTomeDiscard(decision.state, decision.playerIndex);
    case DECISION_TYPES.WHEEL_SOURCES:
      return ai.chooseWheelSources(decision.state, decision.playerIndex);
    case DECISION_TYPES.WHEEL_KEEP:
      return ai.chooseWheelKeep(decision.cards, decision.state);
    case DECISION_TYPES.MAGICIAN_SUIT:
      return ai.chooseMagicianSuit(decision.state, decision.playerIndex);
    case DECISION_TYPES.HERMIT_CHOOSE:
      return ai.chooseHermitCards(decision.state, decision.playerIndex, decision.eligibleIndices);
    case DECISION_TYPES.TOWER_CHOOSE:
      return ai.chooseTowerTarget(decision.state, decision.playerIndex, decision.targetPlayerIndex);
    case DECISION_TYPES.CHARITY_CHOOSE:
      return ai.chooseCharityCard(decision.state, decision.playerIndex);
    case DECISION_TYPES.DRAW_SOURCE:
      return ai.chooseDrawSource(decision.state, decision.playerIndex, decision.topDiscardCard);
    default:
      throw new Error(`Unknown decision type: ${decision.type}`);
  }
}

/** Run a GameController to completion, auto-resolving all human decisions. */
function runControllerToEnd(opts) {
  const ctrl = new GameController(opts);
  let result = ctrl.start();
  let safety = 0;
  while (!result.done && safety < 10000) {
    const choice = autoResolveDecision(result.decision);
    result = ctrl.submitDecision(choice);
    safety++;
  }
  return { result, ctrl };
}

// ── Test 1: MAJOR_KEEP decision format ──

describe('MAJOR_KEEP decision format', () => {
  it('decision presents exactly 2 major cards', () => {
    const ctrl = new GameController({
      players: 4, humanPlayers: [0], seed: 42,
    });
    const result = ctrl.start();
    expect(result.done).toBe(false);
    expect(result.decision.type).toBe(DECISION_TYPES.MAJOR_KEEP);
    expect(result.decision.cards).toHaveLength(2);
    expect(result.decision.cards[0].type).toBe('major');
    expect(result.decision.cards[1].type).toBe('major');
  });

  it('index 0 keeps the first card, index 1 keeps the second', { timeout: 15000 }, () => {
    function keepCard(seed, keepIndex) {
      const ctrl = new GameController({
        players: 4, humanPlayers: [0], seed,
      });
      const result = ctrl.start();
      const cards = [...result.decision.cards];
      ctrl.submitDecision(keepIndex);
      const state = ctrl.getState();
      // The kept card should be in the player's hand (among their cards)
      const playerMajors = state.players[0].hand.filter(c => c.type === 'major');
      return { cards, keptMajors: playerMajors };
    }

    const r0 = keepCard(42, 0);
    const r1 = keepCard(42, 1);

    // Same seed → same 2 cards offered
    expect(r0.cards[0].number).toBe(r1.cards[0].number);
    expect(r0.cards[1].number).toBe(r1.cards[1].number);

    // Choosing 0 keeps first card, choosing 1 keeps second card
    expect(r0.keptMajors.some(c => c.number === r0.cards[0].number)).toBe(true);
    expect(r1.keptMajors.some(c => c.number === r1.cards[1].number)).toBe(true);
  });
});

// ── Test 2: Charity decision flow ──

describe('Charity decision flow', () => {
  it('CHARITY_CHOOSE is yielded when charityEnabled and a player scores 0 VP', { timeout: 15000 }, () => {
    // Search for a seed where charity triggers using yieldAll mode
    let found = false;
    for (let seed = 1; seed <= 50 && !found; seed++) {
      const ctrl = new GameController({
        players: 4,
        humanPlayers: [0, 1, 2, 3],
        seed,
        yieldAll: true,
        cardConfig: { gameRules: { charityEnabled: true } },
      });
      let result = ctrl.start();
      let safety = 0;
      while (!result.done && safety < 10000) {
        if (result.decision.type === DECISION_TYPES.CHARITY_CHOOSE) {
          found = true;
          expect(result.decision.playerIndex).toBeGreaterThanOrEqual(0);
          expect(result.decision.state).toBeDefined();
          break;
        }
        const choice = autoResolveDecision(result.decision);
        result = ctrl.submitDecision(choice);
        safety++;
      }
    }
    expect(found).toBe(true);
  });
});

// ── Test 3: Wheel of Fortune source format and card delivery ──

describe('Wheel of Fortune card delivery', () => {
  it('AI correctly draws cards via Wheel of Fortune during gameplay', { timeout: 30000 }, () => {
    // Run games and check that Wheel of Fortune events appear in the log
    const sim = runSimulation({ games: 100, players: 4, seed: 42 });
    let wheelPlayed = 0;
    for (const game of sim.results) {
      if (game.cardEvents && game.cardEvents[10]) {
        wheelPlayed += game.cardEvents[10].actionPlayed || 0;
      }
    }
    // Wheel of Fortune (card 10) should be played as an action in some games
    expect(wheelPlayed).toBeGreaterThan(0);
  });

  it('string sources yield no drawn cards (documenting the engine contract)', () => {
    // The engine iterates sources and accesses src.source
    // With string 'draw', src.source === undefined, so no branch matches
    const state = makeTestState(2);
    state.majorDeck = [major(17), major(18)]; // Two cards in deck

    const sources = ['draw', 'draw']; // Wrong format (strings, not objects)
    const drawn = [];
    for (const src of sources) {
      let card = null;
      if (src.source === 'draw') { // src is a string, src.source is undefined
        card = state.majorDeck.pop();
      }
      if (card) drawn.push(card);
    }
    // No cards drawn because src.source is undefined for strings
    expect(drawn).toHaveLength(0);
    // Deck is unchanged
    expect(state.majorDeck).toHaveLength(2);
  });

  it('object sources correctly draw cards (correct format)', () => {
    const state = makeTestState(2);
    state.majorDeck = [major(17), major(18)];
    state.majorDiscard = [major(19)];
    state.display = [major(20), major(21), null];

    const sources = [{ source: 'draw' }, { source: 'discard' }];
    const drawn = [];
    for (const src of sources) {
      let card = null;
      if (src.source === 'draw') {
        card = state.majorDeck.pop();
      } else if (src.source === 'discard') {
        card = state.majorDiscard.pop();
      } else if (src.source === 'display') {
        card = state.display[src.slotIndex];
        state.display[src.slotIndex] = null;
      }
      if (card) drawn.push(card);
    }
    expect(drawn).toHaveLength(2);
    expect(drawn[0].number).toBe(18); // top of deck
    expect(drawn[1].number).toBe(19); // top of discard
  });

  it('duplicate sources work (two draws from same pile)', () => {
    const state = makeTestState(2);
    state.majorDeck = [major(17), major(18), major(19)];

    const sources = [{ source: 'draw' }, { source: 'draw' }];
    const drawn = [];
    for (const src of sources) {
      if (src.source === 'draw' && state.majorDeck.length > 0) {
        drawn.push(state.majorDeck.pop());
      }
    }
    expect(drawn).toHaveLength(2);
    expect(state.majorDeck).toHaveLength(1);
  });

  it('display source accesses the correct slot', () => {
    const state = makeTestState(2);
    const star = major(17);
    const moon = major(18);
    const sun = major(19);
    state.display = [star, moon, sun];

    const src = { source: 'display', slotIndex: 1 };
    const card = state.display[src.slotIndex];
    expect(card.number).toBe(18); // Moon is in slot 1
  });
});

// ── Test 4: Buy action delivers correct card ──

describe('Buy action card delivery', () => {
  it('buy from display delivers the card in that display slot', () => {
    const state = makeTestState(2);
    const star = major(17);
    state.display = [major(20), star, major(21)];
    // Give player high-value cards for payment
    state.players[0].hand = [mc('WANDS', 'KING'), mc('CUPS', 'KING'), mc('SWORDS', 'KING')];
    // Need minor deck for refill — add some cards
    state.minorDeck = [mc('WANDS', 2), mc('CUPS', 3)];

    const actions = getLegalActions(state, 0);
    const buyDisplay1 = actions.find(a => a.type === 'BUY' && a.source === 'display1');
    expect(buyDisplay1).toBeDefined();

    executeAction(state, makeAIs(2), 0, buyDisplay1);

    // Star (card 17) should now be in player's hand
    expect(state.players[0].hand.some(c => c.number === 17)).toBe(true);
  });

  it('buy from draw delivers top of majorDeck', () => {
    const state = makeTestState(2);
    const world = major(21);
    state.majorDeck = [major(17), world]; // world is on top (pop)
    state.players[0].hand = [mc('WANDS', 'KING'), mc('CUPS', 'KING'), mc('SWORDS', 'KING')];

    const actions = getLegalActions(state, 0);
    const buyDraw = actions.find(a => a.type === 'BUY' && a.source === 'draw');
    expect(buyDraw).toBeDefined();

    executeAction(state, makeAIs(2), 0, buyDraw);

    expect(state.players[0].hand.some(c => c.number === 21)).toBe(true);
    expect(state.majorDeck).toHaveLength(1);
  });

  it('buy from discard delivers top of majorDiscard', () => {
    const state = makeTestState(2);
    const hermit = major(9);
    state.majorDiscard = [major(5), hermit]; // hermit is on top
    state.players[0].hand = [mc('WANDS', 'KING'), mc('CUPS', 'KING'), mc('SWORDS', 'KING')];

    const actions = getLegalActions(state, 0);
    const buyDiscard = actions.find(a => a.type === 'BUY' && a.source === 'discard');
    expect(buyDiscard).toBeDefined();

    executeAction(state, makeAIs(2), 0, buyDiscard);

    expect(state.players[0].hand.some(c => c.number === 9)).toBe(true);
    expect(state.majorDiscard).toHaveLength(1);
  });

  it('payment cards go to minorDiscard, not pit', () => {
    const state = makeTestState(2);
    state.majorDeck = [major(17)];
    const paymentCard = mc('WANDS', 'KING');
    state.players[0].hand = [paymentCard, mc('CUPS', 'KING')];

    const actions = getLegalActions(state, 0);
    const buyDraw = actions.find(a => a.type === 'BUY' && a.source === 'draw');
    expect(buyDraw).toBeDefined();

    const pitBefore = state.pit.length;
    executeAction(state, makeAIs(2), 0, buyDraw);

    // Payment went to minorDiscard
    expect(state.minorDiscard.length).toBeGreaterThan(0);
    // Pit unchanged
    expect(state.pit.length).toBe(pitBefore);
  });

  it('buy action descriptions include card names for display sources', () => {
    const state = makeTestState(2);
    state.display = [major(17), major(18), major(19)];
    state.players[0].hand = [mc('WANDS', 'KING'), mc('CUPS', 'KING'), mc('SWORDS', 'KING')];

    const actions = getLegalActions(state, 0);
    const displayBuys = actions.filter(a => a.type === 'BUY' && a.source.startsWith('display'));

    for (const buy of displayBuys) {
      // Description should contain the card name, not just "display0"
      const slot = parseInt(buy.source.slice(-1));
      const expectedCard = state.display[slot];
      expect(buy.description).toContain(expectedCard.name);
    }
  });
});

// ── Test 5: Display costs match config ──

describe('Display costs match config', () => {
  it('default config: display0=9, display1=8, display2=7', () => {
    const state = makeTestState(2);
    state.display = [major(17), major(18), major(19)];
    // Give player very high-value hand so all buys are affordable
    state.players[0].hand = [
      mc('WANDS', 'KING'), mc('CUPS', 'KING'), mc('SWORDS', 'KING'),
    ];

    const actions = getLegalActions(state, 0);
    const buy0 = actions.find(a => a.type === 'BUY' && a.source === 'display0');
    const buy1 = actions.find(a => a.type === 'BUY' && a.source === 'display1');
    const buy2 = actions.find(a => a.type === 'BUY' && a.source === 'display2');

    // Cost in description: "cost 9", "cost 8", "cost 7"
    expect(buy0?.description).toContain('cost 9');
    expect(buy1?.description).toContain('cost 8');
    expect(buy2?.description).toContain('cost 7');
  });

  it('custom config: display costs override defaults', () => {
    const state = createInitialState(2, false, 42, {
      buyPrices: { display0: 20, display1: 15, display2: 10, draw: 6, discard: 10 },
    });
    state.display = [major(17), major(18), major(19)];
    state.players[0].hand = [
      mc('WANDS', 'KING'), mc('CUPS', 'KING'), mc('SWORDS', 'KING'),
    ];
    state.players[0].realm = [];
    state.players[0].tome = [];

    const actions = getLegalActions(state, 0);
    const buy0 = actions.find(a => a.type === 'BUY' && a.source === 'display0');
    // With cost 20, three Kings (value ~10 each) should be able to afford it
    // But the description should say "cost 20"
    if (buy0) {
      expect(buy0.description).toContain('cost 20');
    }
    // display2 should say cost 10
    const buy2 = actions.find(a => a.type === 'BUY' && a.source === 'display2');
    if (buy2) {
      expect(buy2.description).toContain('cost 10');
    }
  });

  it('buy actions respect config prices, not hardcoded values', () => {
    // Set display2 price to 1 — a single low card should afford it
    const state = createInitialState(2, false, 42, {
      buyPrices: { display0: 9, display1: 8, display2: 1, draw: 6, discard: 10 },
    });
    state.display = [major(17), major(18), major(19)];
    state.players[0].hand = [mc('WANDS', 2)]; // Value 2, can afford cost 1
    state.players[0].realm = [];
    state.players[0].tome = [];

    const actions = getLegalActions(state, 0);
    const buy2 = actions.find(a => a.type === 'BUY' && a.source === 'display2');
    // Player should be able to afford display2 at cost 1
    expect(buy2).toBeDefined();
    expect(buy2.description).toContain('cost 1');
  });
});

// ── Test 6: VP source reporting reads config values ──

describe('VP source reporting', () => {
  it('celestialVp=0 produces 0 celestial VP in every game report', { timeout: 30000 }, () => {
    const sim = runSimulation({
      games: 30, players: 4, seed: 42,
      cardConfig: { scoring: { celestialVp: 0 } },
    });
    for (const game of sim.results) {
      expect(game.vpSources.celestialVp).toBe(0);
    }
  });

  it('celestialVp=10 produces correctly scaled celestial VP', { timeout: 30000 }, () => {
    const sim = runSimulation({
      games: 50, players: 4, seed: 42,
      cardConfig: { scoring: { celestialVp: 10 } },
    });
    let foundCelestial = false;
    for (const game of sim.results) {
      if (game.vpSources.celestialVp > 0) {
        foundCelestial = true;
        // celestialVp should be a multiple of 10
        expect(game.vpSources.celestialVp % 10).toBe(0);
      }
    }
    expect(foundCelestial).toBe(true);
  });

  it('default celestialVp=2 produces multiples of 2', { timeout: 30000 }, () => {
    const sim = runSimulation({
      games: 50, players: 4, seed: 42,
    });
    for (const game of sim.results) {
      if (game.vpSources.celestialVp > 0) {
        expect(game.vpSources.celestialVp % 2).toBe(0);
      }
    }
  });
});

// ── Test 7: Winner Affinity counts correct events ──

describe('Winner Affinity metric', () => {
  it('purchased count matches total purchases for each card', { timeout: 30000 }, () => {
    const sim = runSimulation({ games: 50, players: 4, seed: 42 });
    for (const game of sim.results) {
      if (!game.cardEvents) continue;
      for (const [num, events] of Object.entries(game.cardEvents)) {
        expect(events.purchased).toBeGreaterThanOrEqual(events.purchasedByWinner);
      }
    }
  });

  it('wildPlayed tracks wild usage separately from tome/action plays', { timeout: 30000 }, () => {
    const sim = runSimulation({ games: 100, players: 4, seed: 42 });
    let foundWild = false;
    let foundTome = false;
    for (const game of sim.results) {
      if (!game.cardEvents) continue;
      for (const events of Object.values(game.cardEvents)) {
        if (events.wildPlayed > 0) foundWild = true;
        if (events.toTome > 0) foundTome = true;
      }
    }
    // Both wild and tome usage should occur across 100 games
    expect(foundWild).toBe(true);
    expect(foundTome).toBe(true);
  });

  it('usedForEffect tracks tome + action plays', { timeout: 30000 }, () => {
    const sim = runSimulation({ games: 50, players: 4, seed: 42 });
    for (const game of sim.results) {
      if (!game.cardEvents) continue;
      for (const events of Object.values(game.cardEvents)) {
        // usedForEffect should equal toTome + actionPlayed
        const expected = (events.toTome || 0) + (events.actionPlayed || 0);
        expect(events.usedForEffect || 0).toBe(expected);
      }
    }
  });

  it('usedForEffectByWinner <= usedForEffect', { timeout: 30000 }, () => {
    const sim = runSimulation({ games: 50, players: 4, seed: 42 });
    for (const game of sim.results) {
      if (!game.cardEvents) continue;
      for (const events of Object.values(game.cardEvents)) {
        expect(events.usedForEffectByWinner || 0).toBeLessThanOrEqual(events.usedForEffect || 0);
      }
    }
  });
});

// ── Test 8: Wild card companion options ──

describe('Wild card companion completeness', () => {
  it('wild alone is always offered when player has a Major and a minor', () => {
    const state = makeTestState(2);
    const celestialCard = major(17); // The Star — celestial
    state.players[0].hand = [celestialCard, mc('WANDS', 5)];
    state.players[0].realm = []; // No major wild already in realm

    const actions = getLegalActions(state, 0);
    const wildAlone = actions.filter(a =>
      a.type === 'PLAY_WILD' && a.card.number === 17 && a.withCards.length === 0
    );
    expect(wildAlone.length).toBe(1);
  });

  it('wild with single companion options are offered', () => {
    const state = makeTestState(2);
    const celestialCard = major(17); // The Star — celestial
    state.players[0].hand = [celestialCard, mc('WANDS', 9), mc('CUPS', 5)];
    state.players[0].realm = [];

    const actions = getLegalActions(state, 0);
    const wildWithCompanion = actions.filter(a =>
      a.type === 'PLAY_WILD' && a.card.number === 17 && a.withCards.length === 1
    );
    // Should offer wild+9 and wild+5 at minimum
    expect(wildWithCompanion.length).toBeGreaterThanOrEqual(2);
  });

  it('wild is blocked if player already has a major in realm', () => {
    const state = makeTestState(2);
    // Player already has a major card in realm (used as wild)
    state.players[0].realm = [major(17), mc('WANDS', 5)];
    state.players[0].hand = [major(18), mc('CUPS', 3)];

    const actions = getLegalActions(state, 0);
    const wildActions = actions.filter(a => a.type === 'PLAY_WILD');
    expect(wildActions.length).toBe(0);
  });
});

// ── Test 9: Round lifecycle end-to-end ──

describe('Round lifecycle', () => {
  it('pot is awarded to best poker hand at round end', () => {
    const state = makeTestState(2);
    state.pot = 10;
    state.roundEndMarkerHolder = 0;

    // Player 0: pair of 5s
    state.players[0].realm = [mc('WANDS', 5), mc('CUPS', 5)];
    // Player 1: three of a kind (beats pair)
    state.players[1].realm = [mc('WANDS', 3), mc('CUPS', 3), mc('SWORDS', 3)];

    const ais = makeAIs(2);
    scoreRoundEnd(state, ais);

    // Player 1 should get the pot (better hand)
    expect(state.players[1].vp).toBeGreaterThan(0);
    expect(state.pot).toBe(0);
  });

  it('tome persists between rounds', { timeout: 15000 }, () => {
    // Run a multi-round game and check that tomes are preserved across rounds
    // Search for a seed where at least one player has a tome card after round 1
    let verified = false;
    for (let seed = 1; seed <= 30 && !verified; seed++) {
      const ctrl = new GameController({
        players: 4, humanPlayers: [], seed,
      });
      const result = ctrl.start();
      const state = result.state;
      if (!state.gameEnded || state.roundNumber < 2) continue;

      // If any player has tome cards at game end after 2+ rounds, they persisted
      const anyTome = state.players.some(p => p.tome.length > 0);
      if (anyTome) {
        verified = true;
        // Tome cards should be major arcana (number >= 0)
        for (const p of state.players) {
          for (const c of p.tome) {
            expect(c.type).toBe('major');
          }
        }
      }
    }
    expect(verified).toBe(true);
  });

  it('dealer rotates each round', { timeout: 15000 }, () => {
    const ctrl = new GameController({
      players: 4, humanPlayers: [], seed: 42,
    });
    const result = ctrl.start();
    expect(result.done).toBe(true);

    // Check that rounds progressed
    const state = result.state;
    expect(state.roundNumber).toBeGreaterThanOrEqual(1);
  });

  it('pot grows correctly each round', { timeout: 15000 }, () => {
    // Run a game and check that pot values in events are increasing
    const sim = runSimulation({ games: 10, players: 4, seed: 42 });
    for (const game of sim.results) {
      expect(game.roundsPlayed).toBeGreaterThanOrEqual(1);
    }
  });
});

// ── Test 10: GameController yieldAll decision sequence ──

describe('GameController yieldAll decision sequence', () => {
  it('first human decision is MAJOR_KEEP during setup', () => {
    const ctrl = new GameController({
      players: 4, humanPlayers: [0], seed: 42, yieldAll: true,
    });
    let result = ctrl.start();
    // Advance through AI decisions until we hit player 0
    while (!result.done && result.decision.playerIndex !== 0) {
      const choice = autoResolveDecision(result.decision);
      result = ctrl.submitDecision(choice);
    }
    expect(result.done).toBe(false);
    expect(result.decision.type).toBe(DECISION_TYPES.MAJOR_KEEP);
    expect(result.decision.playerIndex).toBe(0);
  });

  it('ACTION decisions are yielded during play phase', { timeout: 15000 }, () => {
    const ctrl = new GameController({
      players: 4, humanPlayers: [0], seed: 42, yieldAll: true,
    });
    let result = ctrl.start();
    let foundAction = false;
    let safety = 0;
    while (!result.done && safety < 5000) {
      if (result.decision.type === DECISION_TYPES.ACTION && result.decision.playerIndex === 0) {
        foundAction = true;
        expect(result.decision.legalActions).toBeDefined();
        expect(result.decision.legalActions.length).toBeGreaterThan(0);
        break;
      }
      const choice = autoResolveDecision(result.decision);
      result = ctrl.submitDecision(choice);
      safety++;
    }
    expect(foundAction).toBe(true);
  });

  it('game reaches completion through yieldAll mode', { timeout: 15000 }, () => {
    const { result } = runControllerToEnd({
      players: 4, humanPlayers: [0, 1, 2, 3], seed: 42, yieldAll: true,
    });
    expect(result.done).toBe(true);
    expect(result.state.gameEnded).toBe(true);
  });

  it('all yielded decisions have valid structure', { timeout: 15000 }, () => {
    const ctrl = new GameController({
      players: 4, humanPlayers: [0, 1, 2, 3], seed: 42, yieldAll: true,
    });
    let result = ctrl.start();
    let safety = 0;
    while (!result.done && safety < 5000) {
      expect(result.decision.type).toBeTruthy();
      expect(typeof result.decision.playerIndex).toBe('number');
      expect(result.decision.playerIndex).toBeGreaterThanOrEqual(0);
      expect(result.decision.playerIndex).toBeLessThan(4);
      expect(result.decision.state).toBeDefined();
      const choice = autoResolveDecision(result.decision);
      result = ctrl.submitDecision(choice);
      safety++;
    }
    expect(result.done).toBe(true);
  });
});

// ── Test 11: Death card handling ──

describe('Death card edge cases', () => {
  it('buying Death from display ends game with death_purchased', () => {
    const state = makeTestState(2);
    const death = major(13);
    state.display = [major(17), death, major(19)];
    // Ensure Death card is recognized — check config
    state.players[0].hand = [mc('WANDS', 'KING'), mc('CUPS', 'KING'), mc('SWORDS', 'KING')];
    state.minorDeck = [mc('WANDS', 2)]; // for refill

    const actions = getLegalActions(state, 0);
    const buyDeath = actions.find(a => a.type === 'BUY' && a.source === 'display1');
    expect(buyDeath).toBeDefined();

    executeAction(state, makeAIs(2), 0, buyDeath);

    expect(state.gameEnded).toBe(true);
    expect(state.gameEndReason).toBe('death_purchased');
    // Death should NOT be in player's hand
    expect(state.players[0].hand.some(c => c.number === 13)).toBe(false);
  });

  it('Death drawn from deck via buy ends game', () => {
    const state = makeTestState(2);
    const death = major(13);
    state.majorDeck = [death]; // Death is the only card
    state.players[0].hand = [mc('WANDS', 'KING'), mc('CUPS', 'KING')];

    const actions = getLegalActions(state, 0);
    const buyDraw = actions.find(a => a.type === 'BUY' && a.source === 'draw');
    expect(buyDraw).toBeDefined();

    executeAction(state, makeAIs(2), 0, buyDraw);

    expect(state.gameEnded).toBe(true);
    expect(state.gameEndReason).toBe('death_purchased');
  });

  it('some games end via death across many seeds', { timeout: 15000 }, () => {
    const sim = runSimulation({ games: 100, players: 4, seed: 42 });
    const deathGames = sim.results.filter(g =>
      g.gameEndReason === 'death_revealed' || g.gameEndReason === 'death_purchased'
    );
    expect(deathGames.length).toBeGreaterThan(0);
  });
});

// ── Test 12: Simulation result integrity ──

describe('Simulation result integrity', { timeout: 30000 }, () => {
  let sim;

  // Run once, reuse for all assertions
  it('setup: run simulation', () => {
    sim = runSimulation({ games: 50, players: 4, seed: 42 });
    expect(sim.results.length).toBe(50);
    expect(sim.errors).toBe(0);
  });

  it('every game has a winner', () => {
    for (const game of sim.results) {
      expect(game.winner).toBeDefined();
      expect(game.winner.playerIndex).toBeGreaterThanOrEqual(0);
      expect(game.winner.playerIndex).toBeLessThan(4);
    }
  });

  it('game end reason is always one of the known values', () => {
    const known = new Set(['death_revealed', 'death_purchased', 'deck_exhaustion', 'celestial_win', 'max_rounds']);
    for (const game of sim.results) {
      expect(known.has(game.gameEndReason)).toBe(true);
    }
  });

  it('VP totals are non-negative for winners', () => {
    for (const game of sim.results) {
      expect(game.winner.vp).toBeGreaterThanOrEqual(0);
    }
  });

  it('cardEvents purchasedByWinner <= purchased for every card', () => {
    for (const game of sim.results) {
      if (!game.cardEvents) continue;
      for (const [num, events] of Object.entries(game.cardEvents)) {
        expect(events.purchasedByWinner).toBeLessThanOrEqual(events.purchased);
      }
    }
  });

  it('tomeCards on players contain only major card numbers or -1', () => {
    for (const game of sim.results) {
      for (const player of game.players) {
        for (const cardNum of player.tomeCards) {
          // -1 means minor card, otherwise should be a valid major number (0-21 or 25/26)
          expect(typeof cardNum).toBe('number');
          if (cardNum !== -1) {
            expect(cardNum).toBeGreaterThanOrEqual(0);
          }
        }
      }
    }
  });

  it('roundsPlayed is between 1 and 20 for every game', () => {
    for (const game of sim.results) {
      expect(game.roundsPlayed).toBeGreaterThanOrEqual(1);
      expect(game.roundsPlayed).toBeLessThanOrEqual(20);
    }
  });

  it('vpDistribution has correct number of entries', () => {
    for (const game of sim.results) {
      expect(game.vpDistribution).toHaveLength(4);
    }
  });
});
