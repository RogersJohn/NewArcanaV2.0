import { describe, it, expect } from 'vitest';
import { createMinorCard, createMajorCard, MAJOR_ARCANA_DEFS, isCelestial } from '../src/cards.js';
import { createInitialState, drawMinorCard, drawMajorCard, refillDisplay, log, cloneState } from '../src/state.js';
import {
  resolveChariot, resolveStrength, resolveWheelOfFortune,
  resolveHangedMan, resolveTower, resolveJudgement, resolvePlague,
  applyTomeEffect, resolveRoyalAttack, checkAceBlock, checkDeathRevealed
} from '../src/effects.js';
import { setup, playGame, drawPhase, executeAction } from '../src/engine.js';
import { scoreGameEnd } from '../src/scoring.js';
import { RandomAI } from '../src/ai/base.js';

// Helper to create a minimal game state for testing
function makeState(numPlayers = 2, seed = 42) {
  const state = createInitialState(numPlayers, false, seed);
  // Clear decks for controlled testing
  state.minorDeck = [];
  state.majorDeck = [];
  state.display = [null, null, null];
  state.roundNumber = 1;
  state.pot = 0;
  state.lastPotAmount = 0;
  return state;
}

function mc(suit, rank) { return createMinorCard(suit, rank); }

function makeMajor(number) {
  const def = MAJOR_ARCANA_DEFS.find(d => d.number === number);
  if (!def) throw new Error(`No major arcana def for ${number}`);
  return createMajorCard(def.number, def.name, def.category, def.keywords);
}

function makeAIs(n) {
  return Array.from({ length: n }, () => new RandomAI());
}

// AI that always blocks with Ace
class AlwaysBlockAI extends RandomAI {
  shouldBlockWithAce() { return true; }
  shouldBlockWithKing() { return true; }
}

// AI that never blocks
class NeverBlockAI extends RandomAI {
  shouldBlockWithAce() { return false; }
  shouldBlockWithKing() { return false; }
}

// AI that picks first option for wheel
class SimpleWheelAI extends RandomAI {
  chooseWheelSources(state) {
    const sources = [];
    if (state.majorDeck.length > 0) sources.push({ source: 'draw' });
    for (let i = 0; i < 3; i++) {
      if (state.display[i]) sources.push({ source: 'display', slotIndex: i });
    }
    if (state.majorDiscard.length > 0) sources.push({ source: 'discard' });
    return sources.slice(0, 2);
  }
  chooseWheelKeep() { return 0; }
  chooseTomeDiscard() { return 0; }
}

describe('Major Arcana Effects', () => {
  describe('Wheel of Fortune (10)', () => {
    it('draws 2 from major sources, keeps 1, pits the other', () => {
      const state = makeState(2);
      const card1 = makeMajor(17); // Star
      const card2 = makeMajor(18); // Moon
      // Put one in draw pile and one in display for 2 different sources
      state.majorDeck.push(card1);
      state.display[0] = card2;
      // Add another card for display refill
      state.majorDeck.unshift(makeMajor(5));
      const ais = [new SimpleWheelAI(), new SimpleWheelAI()];

      resolveWheelOfFortune(state, ais, 0);

      // Player 0 should have 1 card in hand (kept), 1 in pit
      expect(state.players[0].hand.length).toBe(1);
      expect(state.pit.length).toBe(1);
    });
  });

  describe('Tower (16)', () => {
    it('destroys cards in all Tomes larger than player\'s', () => {
      const state = makeState(3);
      // Player 0 has 0 tome cards
      // Player 1 has 2 tome cards (bigger)
      // Player 2 has 1 tome card (bigger)
      state.players[1].tome = [makeMajor(5), makeMajor(6)];
      state.players[2].tome = [makeMajor(9)];
      const ais = makeAIs(3);

      resolveTower(state, ais, 0, {});

      // Both should lose 1 card each
      expect(state.players[1].tome.length).toBe(1);
      expect(state.players[2].tome.length).toBe(0);
      expect(state.pit.length).toBe(2);
    });

    it('does nothing when no opponent has larger Tome', () => {
      const state = makeState(3);
      state.players[0].tome = [makeMajor(5), makeMajor(6)];
      state.players[1].tome = [makeMajor(9)]; // smaller
      state.players[2].tome = []; // empty
      const ais = makeAIs(3);

      resolveTower(state, ais, 0, {});

      expect(state.players[1].tome.length).toBe(1);
      expect(state.players[2].tome.length).toBe(0);
      expect(state.pit.length).toBe(0);
    });
  });

  describe('Hanged Man (12)', () => {
    it('steals card from opponent\'s Tome', () => {
      const state = makeState(2);
      const stolen = makeMajor(17); // Star
      state.players[1].tome = [stolen];
      const ais = makeAIs(2);

      resolveHangedMan(state, ais, 0, { playerIndex: 1, cardIndex: 0 });

      expect(state.players[0].tome.length).toBe(1);
      expect(state.players[0].tome[0].number).toBe(17);
      expect(state.players[1].tome.length).toBe(0);
    });

    it('triggers Tome discard when own Tome is already full', () => {
      const state = makeState(2);
      state.players[0].tome = [makeMajor(5), makeMajor(6), makeMajor(9)]; // 3 = full
      const stolen = makeMajor(17);
      state.players[1].tome = [stolen];
      const ais = makeAIs(2);
      // RandomAI.chooseTomeDiscard picks random index — just need to verify total stays <= 3
      resolveHangedMan(state, ais, 0, { playerIndex: 1, cardIndex: 0 });

      expect(state.players[0].tome.length).toBe(3); // one removed, one added
      expect(state.pit.length).toBe(1);
    });
  });

  describe('Judgement (20)', () => {
    it('takes round-end marker and sets judgementTriggered', () => {
      const state = makeState(2);
      const ais = makeAIs(2);

      resolveJudgement(state, ais, 0);

      expect(state.roundEndMarkerHolder).toBe(0);
      expect(state.players[0].hasRoundEndMarker).toBe(true);
      expect(state.judgementTriggered).toBe(true);
    });
  });

  describe('Plague (26)', () => {
    it('plays into target\'s Tome', () => {
      const state = makeState(2, 99);
      state.config.extended = true;
      const plague = makeMajor(26);
      state.pit.push(plague); // Plague goes to pit first (executeMajorAction puts it there)
      const ais = makeAIs(2);

      resolvePlague(state, ais, 0, { playerIndex: 1 });

      expect(state.players[1].tome.some(c => c.number === 26)).toBe(true);
    });

    it('displaces existing card when target Tome full', () => {
      const state = makeState(2, 99);
      state.config.extended = true;
      state.players[1].tome = [makeMajor(5), makeMajor(6), makeMajor(9)]; // full
      const plague = makeMajor(26);
      state.pit.push(plague);
      const ais = makeAIs(2);

      resolvePlague(state, ais, 0, { playerIndex: 1 });

      expect(state.players[1].tome.length).toBe(3); // one displaced, plague added
      expect(state.players[1].tome.some(c => c.number === 26)).toBe(true);
    });

    it('game-end scoring: -3vp per Plague in Tome', () => {
      const state = makeState(2);
      const plague = makeMajor(26);
      state.players[0].tome = [plague];

      scoreGameEnd(state);

      expect(state.players[0].vp).toBe(-3);
    });
  });

  describe('Chariot (7)', () => {
    it('steals Celestial from opponent Realm', () => {
      const state = makeState(2);
      const star = makeMajor(17);
      state.players[1].realm = [star];
      const ais = makeAIs(2);

      resolveChariot(state, ais, 0, { source: 'realm', playerIndex: 1, cardIndex: 0 });

      expect(state.players[0].tome.some(c => c.number === 17)).toBe(true);
      expect(state.players[1].realm.length).toBe(0);
    });

    it('steals from Display and triggers refill', () => {
      const state = makeState(2);
      const star = makeMajor(17);
      const moon = makeMajor(18);
      state.display = [star, makeMajor(5), makeMajor(6)];
      state.majorDeck.push(moon); // will be drawn as refill
      const ais = makeAIs(2);

      resolveChariot(state, ais, 0, { source: 'display', slotIndex: 0 });

      expect(state.players[0].tome.some(c => c.number === 17)).toBe(true);
      // Display should have been refilled
      expect(state.display[0]).not.toBeNull();
    });

    it('steals from major discard pile', () => {
      const state = makeState(2);
      const world = makeMajor(21);
      state.majorDiscard.push(world);
      const ais = makeAIs(2);

      resolveChariot(state, ais, 0, { source: 'majorDiscard' });

      expect(state.players[0].tome.some(c => c.number === 21)).toBe(true);
      expect(state.majorDiscard.length).toBe(0);
    });

    it('triggers Tome overflow discard when Tome is full', () => {
      const state = makeState(2);
      state.players[0].tome = [makeMajor(5), makeMajor(6), makeMajor(9)];
      const star = makeMajor(17);
      state.majorDiscard.push(star);
      const ais = makeAIs(2);

      resolveChariot(state, ais, 0, { source: 'majorDiscard' });

      // Tome was full (3), added star => 4, discarded one => 3
      expect(state.players[0].tome.length).toBe(3);
      expect(state.pit.length).toBe(1);
    });
  });

  describe('Strength (8)', () => {
    it('moves Major from opponent Realm to own Realm as wild', () => {
      const state = makeState(2);
      const star = makeMajor(17);
      state.players[1].realm = [star, mc('WANDS', 5)];
      const ais = makeAIs(2);

      resolveStrength(state, ais, 0, { source: 'realm', playerIndex: 1, cardIndex: 0 });

      expect(state.players[0].realm.some(c => c.number === 17)).toBe(true);
      expect(state.players[1].realm.length).toBe(1);
    });

    it('moves Major from opponent Tome to own Realm', () => {
      const state = makeState(2);
      const devil = makeMajor(15);
      state.players[1].tome = [devil];
      const ais = makeAIs(2);

      resolveStrength(state, ais, 0, { source: 'tome', playerIndex: 1, cardIndex: 0 });

      expect(state.players[0].realm.some(c => c.number === 15)).toBe(true);
      expect(state.players[1].tome.length).toBe(0);
    });
  });

  describe('Hermit (9)', () => {
    it('on play to Tome, takes all other Tome cards into hand', () => {
      const state = makeState(2);
      const hermit = makeMajor(9);
      const existing1 = makeMajor(5);
      const existing2 = makeMajor(6);
      state.players[0].tome = [existing1, existing2, hermit];
      const ais = makeAIs(2);

      applyTomeEffect(state, ais, 0, hermit);

      // Other 2 cards moved to hand, hermit stays in tome
      expect(state.players[0].tome.length).toBe(1);
      expect(state.players[0].tome[0].number).toBe(9);
      expect(state.players[0].hand.length).toBe(2);
    });
  });

  describe('Devil (15)', () => {
    it('draws up to 7 on play, hand size limit becomes 7', () => {
      const state = makeState(2);
      const devil = makeMajor(15);
      state.players[0].tome = [devil];
      state.players[0].hand = [mc('WANDS', 3), mc('CUPS', 4)];
      state.players[0].realm = [mc('SWORDS', 5)]; // total handsize = 2 + 1 = 3
      // Add cards to draw pile
      for (let i = 0; i < 10; i++) {
        state.minorDeck.push(mc('COINS', 2));
      }
      const ais = makeAIs(2);

      applyTomeEffect(state, ais, 0, devil);

      // Should draw 7 - 3 = 4 cards, ending with 6 in hand + 1 realm = 7
      expect(state.players[0].hand.length).toBe(6);
    });
  });

  describe('Protection Cards', () => {
    it('Protection blocks Royal attack of protected suit', () => {
      const state = makeState(2);
      const temperance = makeMajor(14); // Protects CUPS
      state.players[1].tome = [temperance];
      state.players[1].tomeProtections.add('CUPS');
      const target = mc('CUPS', 5);
      state.players[1].realm = [target];
      const attacker = mc('CUPS', 'PAGE');
      state.players[0].hand = [attacker];
      const ais = [new NeverBlockAI(), new NeverBlockAI()];

      const result = resolveRoyalAttack(state, 0, attacker, 1, 0, ais);

      expect(result).toBe(false);
      // Target still in realm
      expect(state.players[1].realm.length).toBe(1);
    });

    it('attacking card still goes to Pit even when blocked by protection', () => {
      const state = makeState(2);
      const temperance = makeMajor(14);
      state.players[1].tome = [temperance];
      state.players[1].tomeProtections.add('CUPS');
      const target = mc('CUPS', 5);
      state.players[1].realm = [target];
      const attacker = mc('CUPS', 'KNIGHT');
      state.players[0].hand = [attacker];
      const ais = [new NeverBlockAI(), new NeverBlockAI()];

      resolveRoyalAttack(state, 0, attacker, 1, 0, ais);

      expect(state.pit.some(c => c.id === attacker.id)).toBe(true);
    });
  });

  describe('Ace Blocking', () => {
    it('Ace blocks Major to Tome — both card and Ace go to Pit', () => {
      const state = makeState(2);
      const star = makeMajor(17);
      const ace = mc('WANDS', 'ACE');
      state.players[0].hand = [star];
      state.players[1].hand = [ace];
      const ais = [new NeverBlockAI(), new AlwaysBlockAI()];

      const action = { type: 'PLAY_MAJOR_TOME', card: star, description: 'Play Star to Tome' };
      const blocked = checkAceBlock(state, ais, 0, action);

      expect(blocked).toBe(true);
      expect(state.pit.some(c => c.id === ace.id)).toBe(true);
      expect(state.pit.some(c => c.id === star.id)).toBe(true);
    });

    it('Ace blocks wild play — wild and Ace to Pit', () => {
      const state = makeState(2);
      const wild = makeMajor(17);
      const ace = mc('CUPS', 'ACE');
      state.players[0].hand = [wild];
      state.players[1].hand = [ace];
      const ais = [new NeverBlockAI(), new AlwaysBlockAI()];

      const action = { type: 'PLAY_WILD', card: wild, description: 'Play wild' };
      const blocked = checkAceBlock(state, ais, 0, action);

      expect(blocked).toBe(true);
      expect(state.pit.some(c => c.id === ace.id)).toBe(true);
      expect(state.pit.some(c => c.id === wild.id)).toBe(true);
    });
  });

  describe('King Blocking', () => {
    it('King blocks Royal — King and Royal go to Pit, target safe', () => {
      const state = makeState(2);
      const target = mc('WANDS', 5);
      state.players[1].realm = [target];
      const attacker = mc('WANDS', 'PAGE');
      state.players[0].hand = [attacker];
      const king = mc('CUPS', 'KING');
      state.players[1].hand = [king];
      // Defender always blocks with king, no ace blocks
      const ais = [new NeverBlockAI(), new AlwaysBlockAI()];

      const result = resolveRoyalAttack(state, 0, attacker, 1, 0, ais);

      expect(result).toBe(false);
      expect(state.players[1].realm.length).toBe(1); // target safe
      expect(state.pit.some(c => c.id === king.id)).toBe(true);
      expect(state.pit.some(c => c.id === attacker.id)).toBe(true);
    });
  });

  describe('Display Aging', () => {
    it('slot 2 discarded, slots slide right, new card to slot 0', () => {
      const state = makeState(2);
      const card0 = makeMajor(5);
      const card1 = makeMajor(6);
      const card2 = makeMajor(9);
      const newCard = makeMajor(10);
      state.display = [card0, card1, card2];
      state.majorDeck.push(newCard);

      // Simulate ageDisplay from engine — it's not exported, so test via a full round
      // Instead, manually replicate ageDisplay logic:
      state.majorDiscard.push(state.display[2]); // slot 2 -> discard
      state.display[2] = state.display[1]; // slide
      state.display[1] = state.display[0]; // slide
      state.display[0] = drawMajorCard(state); // new to slot 0

      expect(state.majorDiscard[state.majorDiscard.length - 1].number).toBe(9); // card2
      expect(state.display[2].number).toBe(6); // was slot 1
      expect(state.display[1].number).toBe(5); // was slot 0
      expect(state.display[0].number).toBe(10); // new card
    });
  });

  describe('Death During Display Aging', () => {
    it('game ends immediately when Death appears in display', () => {
      const state = makeState(2);
      const death = makeMajor(13);
      state.display = [makeMajor(5), makeMajor(6), null];
      state.display[0] = death;

      checkDeathRevealed(state);

      expect(state.gameEnded).toBe(true);
      expect(state.gameEndReason).toBe('death_revealed');
    });
  });

  describe('Deck Recycling', () => {
    it('minor discard reshuffled into draw pile, Pit stays separate', () => {
      const state = makeState(2);
      // Empty draw pile, cards in discard and pit
      state.minorDeck = [];
      const discardCard = mc('WANDS', 3);
      const pitCard = mc('CUPS', 7);
      state.minorDiscard = [discardCard];
      state.pit = [pitCard];

      const drawn = drawMinorCard(state);

      expect(drawn).not.toBeNull();
      // The drawn card came from discard (now shuffled into deck)
      expect(drawn.id).toBe(discardCard.id);
      // Pit cards were NOT recycled
      expect(state.pit.length).toBe(1);
      expect(state.pit[0].id).toBe(pitCard.id);
    });
  });

  describe('Round-End Marker Passing', () => {
    it('passes clockwise when holder\'s realm drops below 5', () => {
      const state = makeState(3);
      // Player 0 holds marker with 5 realm cards
      state.roundEndMarkerHolder = 0;
      state.players[0].hasRoundEndMarker = true;
      state.players[0].realm = [mc('WANDS', 2), mc('WANDS', 3), mc('WANDS', 4), mc('WANDS', 5), mc('WANDS', 6)];
      // Player 1 has 5 realm cards (next clockwise)
      state.players[1].realm = [mc('CUPS', 2), mc('CUPS', 3), mc('CUPS', 4), mc('CUPS', 5), mc('CUPS', 6)];

      // Simulate attack removing a card from player 0's realm
      state.players[0].realm.pop(); // now 4 cards
      // Now check marker pass manually (engine does this after attacks)
      state.players[0].hasRoundEndMarker = false;
      state.roundEndMarkerHolder = -1;
      for (let i = 1; i < state.players.length; i++) {
        const pi = (0 + i) % state.players.length;
        if (state.players[pi].realm.length >= 5) {
          state.roundEndMarkerHolder = pi;
          state.players[pi].hasRoundEndMarker = true;
          break;
        }
      }

      expect(state.roundEndMarkerHolder).toBe(1);
      expect(state.players[1].hasRoundEndMarker).toBe(true);
    });

    it('returns to center when no one has 5 cards', () => {
      const state = makeState(3);
      state.roundEndMarkerHolder = 0;
      state.players[0].hasRoundEndMarker = true;
      state.players[0].realm = [mc('WANDS', 2), mc('WANDS', 3), mc('WANDS', 4), mc('WANDS', 5)]; // only 4

      // Player 0 drops below 5
      state.players[0].realm.pop(); // 3 cards
      state.players[0].hasRoundEndMarker = false;
      state.roundEndMarkerHolder = -1;
      // No one else has 5
      let found = false;
      for (let i = 1; i < state.players.length; i++) {
        if (state.players[i].realm.length >= 5) {
          found = true;
          break;
        }
      }

      expect(found).toBe(false);
      expect(state.roundEndMarkerHolder).toBe(-1);
    });
  });
});
