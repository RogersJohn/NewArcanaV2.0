import { describe, it, expect } from 'vitest';
import { createMinorCard, createMajorCard, MAJOR_ARCANA_DEFS } from '../src/cards.js';
import { createInitialState } from '../src/state.js';
import { scoreRoundEnd, scoreGameEnd, checkCelestialWin, resolveBonus, resolveFool, driveWithAIs, scoreRoundEndGen } from '../src/scoring.js';
import { RandomAI } from '../src/ai/base.js';
import { runSimulation } from '../src/simulation.js';

function mc(suit, rank) { return createMinorCard(suit, rank); }
function major(number) {
  const def = MAJOR_ARCANA_DEFS.find(d => d.number === number);
  return createMajorCard(number, def.name, def.category, def.keywords);
}

function makeTestState(numPlayers = 4) {
  const state = createInitialState(numPlayers);
  state.minorDeck = [];
  state.majorDeck = [];
  state.minorDiscard = [];
  state.display = [null, null, null];
  state.pot = 10;
  state.roundEndMarkerHolder = 0;
  for (const p of state.players) {
    p.hand = [];
    p.realm = [];
    p.tome = [];
  }
  return state;
}

class TestMagicianAI extends RandomAI {
  constructor(suit) { super(); this.magSuit = suit; }
  chooseMagicianSuit() { return this.magSuit; }
}

describe('Pot Award', () => {
  it('awards pot to player with best poker hand', () => {
    const state = makeTestState(2);
    state.pot = 10;
    state.roundEndMarkerHolder = 0;

    // Player 0: pair of 5s
    state.players[0].realm = [mc('WANDS', 5), mc('CUPS', 5)];
    // Player 1: three 3s (beats pair)
    state.players[1].realm = [mc('WANDS', 3), mc('CUPS', 3), mc('SWORDS', 3)];

    const ais = [new RandomAI(), new RandomAI()];
    scoreRoundEnd(state, ais);

    expect(state.players[1].vp).toBeGreaterThan(0);
    expect(state.pot).toBe(0);
  });

  it('does not award pot if no one has round-end marker', () => {
    const state = makeTestState(2);
    state.pot = 10;
    state.roundEndMarkerHolder = -1;

    state.players[0].realm = [mc('WANDS', 5), mc('CUPS', 5)];
    state.players[1].realm = [mc('WANDS', 3)];

    const ais = [new RandomAI(), new RandomAI()];
    scoreRoundEnd(state, ais);

    expect(state.pot).toBe(10); // Not awarded
  });

  it('pot not awarded when all realms empty', () => {
    const state = makeTestState(2);
    state.pot = 10;
    state.roundEndMarkerHolder = 0;

    const ais = [new RandomAI(), new RandomAI()];
    scoreRoundEnd(state, ais);

    // Pot stays (nobody has cards)
    expect(state.pot).toBe(10);
  });
});

describe('Bonus Cards', () => {
  it('High Priestess: 1vp for most Wands (wilds not counted, ties OK)', () => {
    const state = makeTestState(2);
    state.roundEndMarkerHolder = -1; // Don't award pot

    const priestess = major(2);
    state.players[0].tome = [priestess];
    state.players[0].realm = [mc('WANDS', 3), mc('WANDS', 7)];
    state.players[1].realm = [mc('WANDS', 5)];

    const ais = [new RandomAI(), new RandomAI()];
    const bonus = resolveBonus(state, 0, priestess, ais);
    expect(bonus).toBe(1);
  });

  it('High Priestess: ties still score', () => {
    const state = makeTestState(2);
    const priestess = major(2);
    state.players[0].tome = [priestess];
    state.players[0].realm = [mc('WANDS', 3)];
    state.players[1].realm = [mc('WANDS', 5)]; // Same count

    const ais = [new RandomAI(), new RandomAI()];
    const bonus = resolveBonus(state, 0, priestess, ais);
    expect(bonus).toBe(1); // Ties OK
  });

  it('Empress: 1vp for most Cups', () => {
    const state = makeTestState(2);
    const empress = major(3);
    state.players[0].tome = [empress];
    state.players[0].realm = [mc('CUPS', 10), mc('CUPS', 'KING')];
    state.players[1].realm = [mc('CUPS', 2)];

    const ais = [new RandomAI(), new RandomAI()];
    const bonus = resolveBonus(state, 0, empress, ais);
    expect(bonus).toBe(1);
  });

  it('Emperor: 1vp for most Coins', () => {
    const state = makeTestState(2);
    const emperor = major(4);
    state.players[0].tome = [emperor];
    state.players[0].realm = [mc('COINS', 8)];
    state.players[1].realm = [mc('COINS', 3), mc('COINS', 5)];

    const ais = [new RandomAI(), new RandomAI()];
    const bonus = resolveBonus(state, 0, emperor, ais);
    expect(bonus).toBe(0); // Player 1 has more
  });

  it('Justice: 1vp for most Swords', () => {
    const state = makeTestState(2);
    const justice = major(11);
    state.players[0].tome = [justice];
    state.players[0].realm = [mc('SWORDS', 9), mc('SWORDS', 2)];
    state.players[1].realm = [mc('WANDS', 5)];

    const ais = [new RandomAI(), new RandomAI()];
    const bonus = resolveBonus(state, 0, justice, ais);
    expect(bonus).toBe(1);
  });

  it('Magician: 1vp if strictly MORE of named suit (no ties)', () => {
    const state = makeTestState(2);
    const magician = major(1);
    state.players[0].tome = [magician];
    state.players[0].realm = [mc('CUPS', 5), mc('CUPS', 8)];
    state.players[1].realm = [mc('CUPS', 3), mc('CUPS', 9)]; // Same count

    const ais = [new TestMagicianAI('CUPS'), new RandomAI()];
    const bonus = resolveBonus(state, 0, magician, ais);
    expect(bonus).toBe(0); // Tied, Magician needs strictly MORE
  });

  it('Lovers: 1vp per pair', () => {
    const state = makeTestState(2);
    const lovers = major(6);
    state.players[0].tome = [lovers];
    state.players[0].realm = [
      mc('WANDS', 5), mc('CUPS', 5),
      mc('SWORDS', 9), mc('COINS', 9),
      mc('WANDS', 3)
    ];

    const ais = [new RandomAI(), new RandomAI()];
    const bonus = resolveBonus(state, 0, lovers, ais);
    expect(bonus).toBe(2); // Two pairs
  });

  it('Hermit: 1vp if only card in Tome', () => {
    const state = makeTestState(2);
    const hermit = major(9);
    state.players[0].tome = [hermit];
    state.players[0].realm = [mc('WANDS', 3)];

    const ais = [new RandomAI(), new RandomAI()];
    const bonus = resolveBonus(state, 0, hermit, ais);
    expect(bonus).toBe(1);
  });

  it('Hermit: 0vp if other cards in Tome', () => {
    const state = makeTestState(2);
    const hermit = major(9);
    const fool = major(0);
    state.players[0].tome = [hermit, fool];
    state.players[0].realm = [mc('WANDS', 3)];

    const ais = [new RandomAI(), new RandomAI()];
    const bonus = resolveBonus(state, 0, hermit, ais);
    expect(bonus).toBe(0);
  });

  it('Temperance bonus: 1vp if no Cups in realm', () => {
    const state = makeTestState(2);
    const temperance = major(14);
    state.players[0].tome = [temperance];
    state.players[0].realm = [mc('WANDS', 5), mc('SWORDS', 8)]; // No cups

    const ais = [new RandomAI(), new RandomAI()];
    const bonus = resolveBonus(state, 0, temperance, ais);
    expect(bonus).toBe(1);
  });

  it('Temperance bonus: 0vp if Cups in realm', () => {
    const state = makeTestState(2);
    const temperance = major(14);
    state.players[0].tome = [temperance];
    state.players[0].realm = [mc('CUPS', 5), mc('SWORDS', 8)];

    const ais = [new RandomAI(), new RandomAI()];
    const bonus = resolveBonus(state, 0, temperance, ais);
    expect(bonus).toBe(0);
  });
});

describe('Hierophant', () => {
  it('failed bonuses score 1vp when Hierophant is in Tome', () => {
    const state = makeTestState(2);
    state.roundEndMarkerHolder = -1;

    const hierophant = major(5);
    const emperor = major(4); // Coins bonus - will fail
    state.players[0].tome = [hierophant, emperor];
    state.players[0].realm = [mc('WANDS', 3)]; // No coins in realm
    state.players[1].realm = [mc('COINS', 5), mc('COINS', 8)]; // Player 1 has more coins

    const ais = [new RandomAI(), new RandomAI()];
    scoreRoundEnd(state, ais);

    // Emperor failed, but Hierophant gives 1vp for the failure
    expect(state.players[0].vp).toBe(1);
  });

  it('Hierophant blesses bonus cards even when realm is empty', () => {
    const state = makeTestState(2);
    state.roundEndMarkerHolder = -1;

    const hierophant = major(5);
    const magician = major(1);
    state.players[0].tome = [hierophant, magician];
    state.players[0].realm = []; // Empty realm

    const ais = [new TestMagicianAI('CUPS'), new RandomAI()];
    scoreRoundEnd(state, ais);

    // Magician failed (no realm), but Hierophant gives 1vp
    expect(state.players[0].vp).toBe(1);
  });

  it('Without Hierophant, bonus cards score 0 with empty realm', () => {
    const state = makeTestState(2);
    state.roundEndMarkerHolder = -1;

    const magician = major(1);
    state.players[0].tome = [magician];
    state.players[0].realm = []; // Empty realm, no Hierophant

    const ais = [new TestMagicianAI('CUPS'), new RandomAI()];
    scoreRoundEnd(state, ais);

    expect(state.players[0].vp).toBe(0);
  });
});

describe('Celestial Win', () => {
  it('detects 3 celestials in Tome/Realm/Vault', () => {
    const state = makeTestState(2);
    state.players[0].tome = [major(17), major(18)]; // Star, Moon
    state.players[0].realm = [major(19)]; // Sun

    const winner = checkCelestialWin(state);
    expect(winner).toBe(0);
  });

  it('returns -1 with fewer than 3 celestials', () => {
    const state = makeTestState(2);
    state.players[0].tome = [major(17), major(18)];

    const winner = checkCelestialWin(state);
    expect(winner).toBe(-1);
  });

  it('counts celestials across Tome, Realm, and Vault', () => {
    const state = makeTestState(2);
    state.players[1].tome = [major(17)];
    state.players[1].realm = [major(18)];
    state.players[1].vault = [major(21)]; // The World

    const winner = checkCelestialWin(state);
    expect(winner).toBe(1);
  });
});

describe('Game End Scoring', () => {
  it('Celestials earn 2vp each', () => {
    const state = makeTestState(2);
    state.players[0].tome = [major(17), major(18)];

    scoreGameEnd(state);

    expect(state.players[0].vp).toBe(4); // 2 celestials * 2vp
  });

  it('Plague costs -3vp', () => {
    const state = makeTestState(2);
    state.players[0].tome = [major(26)]; // Plague

    scoreGameEnd(state);

    expect(state.players[0].vp).toBe(-3);
  });

  it('Celestials and Plague stack correctly', () => {
    const state = makeTestState(2);
    state.players[0].tome = [major(17), major(26)]; // Star + Plague

    scoreGameEnd(state);

    expect(state.players[0].vp).toBe(-1); // 2 - 3 = -1
  });
});

describe('Fool Duplication', () => {
  it('duplicates best opponent bonus (evaluated from owner perspective)', () => {
    const state = makeTestState(2);
    const fool = major(0);
    state.players[0].tome = [fool];
    // Owner has most Swords (3) — Fool evaluates from OWNER's perspective
    state.players[0].realm = [mc('SWORDS', 5), mc('SWORDS', 8), mc('SWORDS', 10)];

    // Opponent has Justice (Swords bonus) in Tome
    const justice = major(11);
    state.players[1].tome = [justice];
    state.players[1].realm = [mc('SWORDS', 3)];

    const ais = [new RandomAI(), new RandomAI()];
    const bonus = resolveFool(state, 0, ais);
    // Fool copies Justice and checks owner's Swords count — owner has most
    expect(bonus).toBe(1);
  });
});

describe('Fix #8: Final round scoring when Death ends the game', () => {
  it('awards pot when game ends via Death (gameEnded=true, no marker holder)', () => {
    const state = makeTestState(4);
    state.pot = 4;
    state.roundEndMarkerHolder = -1; // No marker holder — Death ended the game mid-round
    state.gameEnded = true;
    state.gameEndReason = 'death_purchased';
    state.roundNumber = 1;

    // Player 0 has the best realm hand
    state.players[0].realm = [mc('CUPS', 'KING'), mc('CUPS', 'QUEEN'), mc('CUPS', 'KNIGHT')];
    // Player 1 has a weaker realm hand
    state.players[1].realm = [mc('SWORDS', 3), mc('SWORDS', 5)];

    const ais = [new RandomAI(), new RandomAI(), new RandomAI(), new RandomAI()];
    scoreRoundEnd(state, ais);

    // Pot should have been awarded to player 0 (best hand)
    expect(state.players[0].vp).toBeGreaterThan(0);
    expect(state.pot).toBe(0);
  });

  it('does not double-score if scoreRoundEnd is called twice for the same round', () => {
    const state = makeTestState(2);
    state.pot = 10;
    state.roundEndMarkerHolder = 0;
    state.roundNumber = 1;

    // Player 0 has realm cards and a bonus (Empress = CUPS bonus)
    state.players[0].realm = [mc('CUPS', 5), mc('CUPS', 8), mc('CUPS', 'KING')];
    state.players[0].tome = [major(3)]; // Empress
    // Player 1 has weaker realm
    state.players[1].realm = [mc('SWORDS', 2)];

    const ais = [new RandomAI(), new RandomAI()];
    scoreRoundEnd(state, ais);

    const vpAfterFirst = state.players[0].vp;
    expect(vpAfterFirst).toBeGreaterThan(0); // Got pot + bonus

    // Call again for the same round — should be a no-op
    scoreRoundEnd(state, ais);
    expect(state.players[0].vp).toBe(vpAfterFirst);
  });
});

describe('Lovers Full House Bonus (Issue #6)', () => {
  it('Full House realm awards 1vp for pair component', () => {
    const state = makeTestState(4);
    const p = state.players[0];
    // Three 5s and two 8s = Full House
    p.realm = [mc('WANDS', 5), mc('CUPS', 5), mc('SWORDS', 5), mc('WANDS', 8), mc('CUPS', 8)];
    const lovers = major(6); // The Lovers
    p.tome = [lovers];
    const ais = [new RandomAI(), new RandomAI(), new RandomAI(), new RandomAI()];
    const vp = resolveBonus(state, 0, lovers, ais);
    expect(vp).toBe(1); // 1 pair in a Full House
  });

  it('countsFullHouse: false does not award VP for Full House', () => {
    const state = makeTestState(4);
    // Override countsFullHouse to false
    const loversConfig = state.config.majorArcana.find(m => m.number === 6);
    loversConfig.effect.bonus.countsFullHouse = false;
    // Rebuild majorArcanaMap
    state.config.majorArcanaMap = new Map();
    for (const def of state.config.majorArcana) {
      state.config.majorArcanaMap.set(def.number, def);
    }
    const p = state.players[0];
    p.realm = [mc('WANDS', 5), mc('CUPS', 5), mc('SWORDS', 5), mc('WANDS', 8), mc('CUPS', 8)];
    const lovers = major(6);
    p.tome = [lovers];
    const ais = [new RandomAI(), new RandomAI(), new RandomAI(), new RandomAI()];
    const vp = resolveBonus(state, 0, lovers, ais);
    // Without countsFullHouse, the pair (count===2) still counts normally
    // Two 8s have count===2, so pairCount should be 1 even without Full House logic
    expect(vp).toBe(1);
  });

  it('Two Pair realm still scores 2vp', () => {
    const state = makeTestState(4);
    const p = state.players[0];
    p.realm = [mc('WANDS', 5), mc('CUPS', 5), mc('WANDS', 8), mc('CUPS', 8), mc('SWORDS', 3)];
    const lovers = major(6);
    p.tome = [lovers];
    const ais = [new RandomAI(), new RandomAI(), new RandomAI(), new RandomAI()];
    const vp = resolveBonus(state, 0, lovers, ais);
    expect(vp).toBe(2);
  });

  it('One Pair realm still scores 1vp', () => {
    const state = makeTestState(4);
    const p = state.players[0];
    p.realm = [mc('WANDS', 5), mc('CUPS', 5), mc('WANDS', 3), mc('CUPS', 8), mc('SWORDS', 10)];
    const lovers = major(6);
    p.tome = [lovers];
    const ais = [new RandomAI(), new RandomAI(), new RandomAI(), new RandomAI()];
    const vp = resolveBonus(state, 0, lovers, ais);
    expect(vp).toBe(1);
  });
});

describe('Celestial Possession Includes Hand (Issue #8)', () => {
  it('default: 3 Celestials in hand does NOT trigger win', () => {
    const state = makeTestState(4);
    const p = state.players[0];
    p.hand = [major(17), major(18), major(19)]; // Star, Moon, Sun
    expect(checkCelestialWin(state)).toBe(-1);
  });

  it('with flag: 3 Celestials in hand triggers win', () => {
    const state = makeTestState(4);
    state.config.gameRules.celestialPossessionIncludesHand = true;
    const p = state.players[0];
    p.hand = [major(17), major(18), major(19)];
    expect(checkCelestialWin(state)).toBe(0);
  });

  it('with flag: 2 in tome + 1 in hand triggers win', () => {
    const state = makeTestState(4);
    state.config.gameRules.celestialPossessionIncludesHand = true;
    const p = state.players[0];
    p.tome = [major(17), major(18)];
    p.hand = [major(19)];
    expect(checkCelestialWin(state)).toBe(0);
  });

  it('3 Celestials in tome wins regardless of flag', () => {
    const state = makeTestState(4);
    const p = state.players[0];
    p.tome = [major(17), major(18), major(19)];
    expect(checkCelestialWin(state)).toBe(0);
  });
});

describe('VP Source Reporting (Issue #10)', () => {
  it('simulation results include vpSources with pot, bonus, and celestial VP', { timeout: 30000 }, () => {
    const sim = runSimulation({
      games: 50, players: 4, seed: 99, aiAssignment: 'diverse',
    });
    expect(sim.results.length).toBe(50);
    for (const game of sim.results) {
      expect(game.vpSources).toBeDefined();
      expect(typeof game.vpSources.potVp).toBe('number');
      expect(typeof game.vpSources.bonusVp).toBe('number');
      expect(typeof game.vpSources.celestialVp).toBe('number');
      expect(game.vpSources.potVp).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('Pot tie splitting', () => {
  it('splits pot equally between two players with identical hands', () => {
    const state = createInitialState(4, false, 42);
    state.roundNumber = 1;
    state.roundEndMarkerHolder = 0;
    state.pot = 10;

    // Give players 0 and 1 identical pairs
    state.players[0].realm = [mc('WANDS', 5), mc('CUPS', 5)];
    state.players[1].realm = [mc('SWORDS', 5), mc('COINS', 5)];
    state.players[2].realm = [mc('WANDS', 2)];
    state.players[3].realm = [];

    const vpBefore0 = state.players[0].vp;
    const vpBefore1 = state.players[1].vp;

    const ais = Array.from({ length: 4 }, () => new RandomAI());
    driveWithAIs(scoreRoundEndGen(state), ais);

    // Each tied player gets 5vp (10 / 2)
    expect(state.players[0].vp - vpBefore0).toBe(5);
    expect(state.players[1].vp - vpBefore1).toBe(5);
    expect(state.pot).toBe(0);
  });

  it('carries over remainder when pot does not divide evenly', () => {
    const state = createInitialState(3, false, 42);
    state.roundNumber = 1;
    state.roundEndMarkerHolder = 0;
    state.pot = 7;

    // Give players 0 and 1 identical pairs
    state.players[0].realm = [mc('WANDS', 5), mc('CUPS', 5)];
    state.players[1].realm = [mc('SWORDS', 5), mc('COINS', 5)];
    state.players[2].realm = [mc('WANDS', 2)];

    const ais = Array.from({ length: 3 }, () => new RandomAI());
    driveWithAIs(scoreRoundEndGen(state), ais);

    // 7 / 2 = 3 each, 1 remainder carries over
    expect(state.pot).toBe(1);
  });
});

describe('Celestial VP per-card override (Issue #34)', () => {
  it('uses vpAtGameEnd from card effect when set to 0', () => {
    const state = createInitialState(4, false, 42, {
      scoring: { celestialVp: 2 },
      majorArcana: [
        { number: 17, name: 'The Star', category: 'celestial', keywords: ['celestial'], suit: null,
          effect: { type: 'celestial', vpAtGameEnd: 0, winConditionGroup: 'celestial' } },
        { number: 13, name: 'Death', category: 'action', keywords: ['game-end'], suit: null,
          effect: { type: 'game_end_trigger', trigger: 'death_revealed' } },
      ]
    });
    state.gameEnded = true;
    state.gameEndReason = 'death_revealed';
    state.roundNumber = 3;

    const star = createMajorCard(17, 'The Star', 'celestial', ['celestial']);
    state.players[0].tome.push(star);

    const vpBefore = state.players[0].vp;
    scoreGameEnd(state);

    // vpAtGameEnd is 0 on the card, so no VP should be awarded
    expect(state.players[0].vp - vpBefore).toBe(0);
  });

  it('falls back to config.scoring.celestialVp when vpAtGameEnd not set on card', () => {
    const state = createInitialState(4, false, 42, {
      scoring: { celestialVp: 5 },
      majorArcana: [
        // Override Star with no vpAtGameEnd in effect
        { number: 17, name: 'The Star', category: 'celestial', keywords: ['celestial'], suit: null,
          effect: { type: 'celestial', winConditionGroup: 'celestial' } },
        { number: 13, name: 'Death', category: 'action', keywords: ['game-end'], suit: null,
          effect: { type: 'game_end_trigger', trigger: 'death_revealed' } },
      ]
    });
    state.gameEnded = true;
    state.gameEndReason = 'death_revealed';
    state.roundNumber = 3;

    const star = createMajorCard(17, 'The Star', 'celestial', ['celestial']);
    state.players[0].tome.push(star);

    const vpBefore = state.players[0].vp;
    scoreGameEnd(state);

    // No vpAtGameEnd on card effect, falls back to config.scoring.celestialVp = 5
    expect(state.players[0].vp - vpBefore).toBe(5);
  });
});
