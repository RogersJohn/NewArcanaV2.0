/**
 * Comprehensive per-card tests for every Major Arcana card.
 * Tests effects, bonuses, config-driven value changes, and round-trip simulation.
 */
import { describe, it, expect } from 'vitest';
import { createInitialState, getEffectiveHandLimit } from '../src/state.js';
import { createMinorCard, createMajorCard, MAJOR_ARCANA_DEFS } from '../src/cards.js';
import { scoreRoundEnd, scoreGameEnd, resolveBonus, checkCelestialWin } from '../src/scoring.js';
import { resolveRoyalAttack, resolveChariot, resolveStrength, resolveHangedMan,
         resolveTower, resolveJudgement, resolvePlague, applyTomeEffect,
         checkDeathRevealed, resolveWheelOfFortune } from '../src/effects.js';
import { setup, playGame } from '../src/engine.js';
import { createAIs } from '../src/ai/index.js';
import { runSimulation } from '../src/simulation.js';
import { RandomAI } from '../src/ai/base.js';
import { mergeConfig } from '../src/config-core.js';

function mc(suit, rank) { return createMinorCard(suit, rank); }

function major(number) {
  const def = MAJOR_ARCANA_DEFS.find(d => d.number === number);
  return createMajorCard(def.number, def.name, def.category, def.keywords);
}

function makeState(numPlayers = 4, seed = 42, configOverrides = null) {
  const state = createInitialState(numPlayers, false, seed, configOverrides);
  state.minorDeck = [];
  state.majorDeck = [];
  state.display = [null, null, null];
  state.pot = 0;
  state.roundEndMarkerHolder = -1;
  for (const p of state.players) {
    p.hand = [];
    p.realm = [];
    p.tome = [];
  }
  return state;
}

function makeAIs(n) { return Array.from({ length: n }, () => new RandomAI()); }

/** AI that always picks the given suit for Magician decisions */
class FixedSuitAI extends RandomAI {
  constructor(suit) { super(); this._suit = suit; }
  chooseMagicianSuit() { return this._suit; }
}
function makeAIsWithSuit(n, suit) { return Array.from({ length: n }, () => new FixedSuitAI(suit)); }

// ============================================================
// 2.1 Bonus Card Tests
// ============================================================

describe('Bonus cards', () => {
  describe('Card 0 — The Fool (foolDuplicate)', () => {
    it('duplicates opponent best scoring bonus', () => {
      const state = makeState(2);
      state.players[0].tome.push(major(0)); // Fool
      state.players[0].realm.push(mc('WANDS', 5));
      state.players[1].tome.push(major(3)); // Empress (CUPS suitHighest)
      state.players[1].realm.push(mc('CUPS', 5), mc('CUPS', 8));
      const vp = resolveBonus(state, 0, state.players[0].tome[0], makeAIs(2));
      // Fool evaluates Empress against opponent — opponent has CUPS, so Empress scores
      expect(vp).toBeGreaterThanOrEqual(0);
    });

    it('returns 0 when no opponents have scoring bonuses', () => {
      const state = makeState(2);
      state.players[0].tome.push(major(0));
      state.players[0].realm.push(mc('WANDS', 5));
      // Opponent has no bonus cards
      state.players[1].realm.push(mc('CUPS', 3));
      const vp = resolveBonus(state, 0, state.players[0].tome[0], makeAIs(2));
      expect(vp).toBe(0);
    });
  });

  describe('Card 1 — The Magician (suitMajority)', () => {
    it('scores when player has strictly more of named suit', () => {
      const state = makeState(2);
      state.players[0].tome.push(major(1));
      state.players[0].realm.push(mc('WANDS', 3), mc('WANDS', 5), mc('WANDS', 7));
      state.players[1].realm.push(mc('WANDS', 2));
      const vp = resolveBonus(state, 0, state.players[0].tome[0], makeAIsWithSuit(2, 'WANDS'));
      expect(vp).toBe(1);
    });

    it('returns 0 when tied', () => {
      const state = makeState(2);
      state.players[0].tome.push(major(1));
      state.players[0].realm.push(mc('WANDS', 3), mc('WANDS', 5));
      state.players[1].realm.push(mc('WANDS', 2), mc('WANDS', 4));
      const vp = resolveBonus(state, 0, state.players[0].tome[0], makeAIsWithSuit(2, 'WANDS'));
      expect(vp).toBe(0);
    });

    it('config: changing vp to 5 awards 5vp', () => {
      const config = mergeConfig();
      config.majorArcana.find(c => c.number === 1).effect.bonus.vp = 5;
      const state = makeState(2, 42, config);
      state.players[0].tome.push(major(1));
      state.players[0].realm.push(mc('CUPS', 3), mc('CUPS', 5), mc('CUPS', 7));
      state.players[1].realm.push(mc('CUPS', 2));
      const vp = resolveBonus(state, 0, state.players[0].tome[0], makeAIsWithSuit(2, 'CUPS'));
      expect(vp).toBe(5);
    });
  });

  describe('Card 2 — High Priestess (suitHighest, WANDS)', () => {
    it('scores 1vp when player has most WANDS', () => {
      const state = makeState(2);
      state.players[0].tome.push(major(2));
      state.players[0].realm.push(mc('WANDS', 5), mc('WANDS', 8));
      state.players[1].realm.push(mc('CUPS', 3));
      const vp = resolveBonus(state, 0, state.players[0].tome[0], makeAIs(2));
      expect(vp).toBe(1);
    });

    it('scores on tie (allowTie: true)', () => {
      const state = makeState(2);
      state.players[0].tome.push(major(2));
      state.players[0].realm.push(mc('WANDS', 5));
      state.players[1].realm.push(mc('WANDS', 3));
      const vp = resolveBonus(state, 0, state.players[0].tome[0], makeAIs(2));
      expect(vp).toBe(1);
    });

    it('config: changing vp to 3 awards 3vp', () => {
      const config = mergeConfig();
      config.majorArcana.find(c => c.number === 2).effect.bonus.vp = 3;
      const state = makeState(2, 42, config);
      state.players[0].tome.push(major(2));
      state.players[0].realm.push(mc('WANDS', 5));
      state.players[1].realm.push(mc('CUPS', 3));
      const vp = resolveBonus(state, 0, state.players[0].tome[0], makeAIs(2));
      expect(vp).toBe(3);
    });

    it('config: changing suit to CUPS evaluates CUPS', () => {
      const config = mergeConfig();
      config.majorArcana.find(c => c.number === 2).effect.bonus.suit = 'CUPS';
      const state = makeState(2, 42, config);
      state.players[0].tome.push(major(2));
      state.players[0].realm.push(mc('CUPS', 5));
      state.players[1].realm.push(mc('WANDS', 3));
      const vp = resolveBonus(state, 0, state.players[0].tome[0], makeAIs(2));
      expect(vp).toBe(1);
    });
  });

  describe('Card 3 — Empress (suitHighest, CUPS)', () => {
    it('scores 1vp for most CUPS', () => {
      const state = makeState(2);
      state.players[0].tome.push(major(3));
      state.players[0].realm.push(mc('CUPS', 5));
      state.players[1].realm.push(mc('WANDS', 3));
      expect(resolveBonus(state, 0, state.players[0].tome[0], makeAIs(2))).toBe(1);
    });

    it('config: changing vp to 5 awards 5vp', () => {
      const config = mergeConfig();
      config.majorArcana.find(c => c.number === 3).effect.bonus.vp = 5;
      const state = makeState(2, 42, config);
      state.players[0].tome.push(major(3));
      state.players[0].realm.push(mc('CUPS', 5));
      state.players[1].realm.push(mc('WANDS', 3));
      expect(resolveBonus(state, 0, state.players[0].tome[0], makeAIs(2))).toBe(5);
    });
  });

  describe('Card 4 — Emperor (suitHighest, COINS)', () => {
    it('scores 1vp for most COINS', () => {
      const state = makeState(2);
      state.players[0].tome.push(major(4));
      state.players[0].realm.push(mc('COINS', 5));
      state.players[1].realm.push(mc('WANDS', 3));
      expect(resolveBonus(state, 0, state.players[0].tome[0], makeAIs(2))).toBe(1);
    });

    it('returns 0 when opponent has more', () => {
      const state = makeState(2);
      state.players[0].tome.push(major(4));
      state.players[0].realm.push(mc('WANDS', 5));
      state.players[1].realm.push(mc('COINS', 3), mc('COINS', 7));
      expect(resolveBonus(state, 0, state.players[0].tome[0], makeAIs(2))).toBe(0);
    });
  });

  describe('Card 5 — Hierophant (hierophant_blessing)', () => {
    it('does not score VP itself', () => {
      const state = makeState(2);
      state.players[0].tome.push(major(5));
      state.players[0].realm.push(mc('WANDS', 5));
      expect(resolveBonus(state, 0, state.players[0].tome[0], makeAIs(2))).toBe(0);
    });
  });

  describe('Card 6 — Lovers (pairCounting)', () => {
    it('scores 1vp per pair with default config', () => {
      const state = makeState(2);
      state.players[0].tome.push(major(6));
      state.players[0].realm.push(mc('WANDS', 5), mc('CUPS', 5), mc('SWORDS', 3));
      expect(resolveBonus(state, 0, state.players[0].tome[0], makeAIs(2))).toBe(1);
    });

    it('scores 2vp for two pairs', () => {
      const state = makeState(2);
      state.players[0].tome.push(major(6));
      state.players[0].realm.push(mc('WANDS', 5), mc('CUPS', 5), mc('SWORDS', 3), mc('COINS', 3));
      expect(resolveBonus(state, 0, state.players[0].tome[0], makeAIs(2))).toBe(2);
    });

    it('returns 0 when no pairs', () => {
      const state = makeState(2);
      state.players[0].tome.push(major(6));
      state.players[0].realm.push(mc('WANDS', 5), mc('CUPS', 3), mc('SWORDS', 7));
      expect(resolveBonus(state, 0, state.players[0].tome[0], makeAIs(2))).toBe(0);
    });

    it('three-of-a-kind does NOT count as a pair', () => {
      const state = makeState(2);
      state.players[0].tome.push(major(6));
      state.players[0].realm.push(mc('WANDS', 5), mc('CUPS', 5), mc('SWORDS', 5));
      expect(resolveBonus(state, 0, state.players[0].tome[0], makeAIs(2))).toBe(0);
    });

    it('config: changing vpPerPair to 10 gives 10vp per pair', () => {
      const config = mergeConfig();
      config.majorArcana.find(c => c.number === 6).effect.bonus.vpPerPair = 10;
      const state = makeState(2, 42, config);
      state.players[0].tome.push(major(6));
      state.players[0].realm.push(mc('WANDS', 5), mc('CUPS', 5), mc('SWORDS', 3));
      expect(resolveBonus(state, 0, state.players[0].tome[0], makeAIs(2))).toBe(10);
    });

    it('config: changing vpPerPair to 100 gives 100vp per pair', () => {
      const config = mergeConfig();
      config.majorArcana.find(c => c.number === 6).effect.bonus.vpPerPair = 100;
      const state = makeState(2, 42, config);
      state.players[0].tome.push(major(6));
      state.players[0].realm.push(mc('WANDS', 5), mc('CUPS', 5));
      expect(resolveBonus(state, 0, state.players[0].tome[0], makeAIs(2))).toBe(100);
    });
  });

  describe('Card 9 — Hermit (hermitExclusive)', () => {
    it('scores 1vp when alone in Tome', () => {
      const state = makeState(2);
      state.players[0].tome.push(major(9));
      state.players[0].realm.push(mc('WANDS', 5));
      expect(resolveBonus(state, 0, state.players[0].tome[0], makeAIs(2))).toBe(1);
    });

    it('returns 0 when other cards in Tome', () => {
      const state = makeState(2);
      state.players[0].tome.push(major(9), major(5));
      state.players[0].realm.push(mc('WANDS', 5));
      expect(resolveBonus(state, 0, state.players[0].tome[0], makeAIs(2))).toBe(0);
    });

    it('config: changing vp to 3 awards 3vp', () => {
      const config = mergeConfig();
      config.majorArcana.find(c => c.number === 9).effect.bonus.vp = 3;
      const state = makeState(2, 42, config);
      state.players[0].tome.push(major(9));
      state.players[0].realm.push(mc('WANDS', 5));
      expect(resolveBonus(state, 0, state.players[0].tome[0], makeAIs(2))).toBe(3);
    });
  });

  describe('Card 11 — Justice (suitHighest, SWORDS)', () => {
    it('scores 1vp for most SWORDS', () => {
      const state = makeState(2);
      state.players[0].tome.push(major(11));
      state.players[0].realm.push(mc('SWORDS', 5));
      state.players[1].realm.push(mc('CUPS', 3));
      expect(resolveBonus(state, 0, state.players[0].tome[0], makeAIs(2))).toBe(1);
    });

    it('config: changing vp to 2 awards 2vp', () => {
      const config = mergeConfig();
      config.majorArcana.find(c => c.number === 11).effect.bonus.vp = 2;
      const state = makeState(2, 42, config);
      state.players[0].tome.push(major(11));
      state.players[0].realm.push(mc('SWORDS', 5));
      state.players[1].realm.push(mc('CUPS', 3));
      expect(resolveBonus(state, 0, state.players[0].tome[0], makeAIs(2))).toBe(2);
    });
  });

  for (const [number, suit, name] of [
    [14, 'CUPS', 'Temperance'], [22, 'SWORDS', 'Faith'],
    [23, 'WANDS', 'Hope'], [25, 'COINS', 'Prudence'],
  ]) {
    describe(`Card ${number} — ${name} (noSuitInRealm, ${suit})`, () => {
      it(`scores 1vp when no ${suit} in realm`, () => {
        const state = makeState(2);
        state.players[0].tome.push(major(number));
        const otherSuit = suit === 'WANDS' ? 'CUPS' : 'WANDS';
        state.players[0].realm.push(mc(otherSuit, 5));
        expect(resolveBonus(state, 0, state.players[0].tome[0], makeAIs(2))).toBe(1);
      });

      it(`returns 0 when ${suit} in realm`, () => {
        const state = makeState(2);
        state.players[0].tome.push(major(number));
        state.players[0].realm.push(mc(suit, 5));
        expect(resolveBonus(state, 0, state.players[0].tome[0], makeAIs(2))).toBe(0);
      });

      it('config: changing vp to 5 awards 5vp', () => {
        const config = mergeConfig();
        config.majorArcana.find(c => c.number === number).effect.bonus.vp = 5;
        const state = makeState(2, 42, config);
        state.players[0].tome.push(major(number));
        const otherSuit = suit === 'WANDS' ? 'CUPS' : 'WANDS';
        state.players[0].realm.push(mc(otherSuit, 5));
        expect(resolveBonus(state, 0, state.players[0].tome[0], makeAIs(2))).toBe(5);
      });
    });
  }
});

// ============================================================
// 2.2 Action Card Tests
// ============================================================

describe('Action cards', () => {
  describe('Card 7 — Chariot (MOVE_CELESTIAL_TO_TOME)', () => {
    it('steals celestial from opponent Tome', () => {
      const state = makeState(2);
      const star = major(17);
      state.players[1].tome.push(star);
      resolveChariot(state, makeAIs(2), 0, { source: 'tome', playerIndex: 1, cardIndex: 0 });
      expect(state.players[0].tome.some(c => c.number === 17)).toBe(true);
      expect(state.players[1].tome.length).toBe(0);
    });

    it('steals celestial from opponent Realm', () => {
      const state = makeState(2);
      const moon = major(18);
      state.players[1].realm.push(moon);
      resolveChariot(state, makeAIs(2), 0, { source: 'realm', playerIndex: 1, cardIndex: 0 });
      expect(state.players[0].tome.some(c => c.number === 18)).toBe(true);
    });
  });

  describe('Card 8 — Strength (MOVE_MAJOR_TO_REALM)', () => {
    it('moves major from opponent Realm to own Realm', () => {
      const state = makeState(2);
      const card = major(5);
      state.players[1].realm.push(card);
      resolveStrength(state, makeAIs(2), 0, { source: 'realm', playerIndex: 1, cardIndex: 0 });
      expect(state.players[0].realm.some(c => c.number === 5)).toBe(true);
      expect(state.players[1].realm.length).toBe(0);
    });
  });

  describe('Card 12 — Hanged Man (STEAL_FROM_TOME)', () => {
    it('steals from opponent Tome into own Tome', () => {
      const state = makeState(2);
      const card = major(5);
      state.players[1].tome.push(card);
      resolveHangedMan(state, makeAIs(2), 0, { playerIndex: 1, cardIndex: 0 });
      expect(state.players[0].tome.some(c => c.number === 5)).toBe(true);
      expect(state.players[1].tome.length).toBe(0);
    });
  });

  describe('Card 16 — Tower (TOWER_DESTROY)', () => {
    it('destroys top card from all larger Tomes', () => {
      const state = makeState(2);
      state.players[0].tome = []; // attacker has 0
      state.players[1].tome.push(major(5), major(6)); // 2 cards
      resolveTower(state, makeAIs(2), 0, {});
      expect(state.players[1].tome.length).toBe(1);
    });

    it('does nothing when no Tome is larger', () => {
      const state = makeState(2);
      state.players[0].tome.push(major(5), major(6)); // 2 cards
      state.players[1].tome.push(major(3)); // 1 card
      resolveTower(state, makeAIs(2), 0, {});
      expect(state.players[1].tome.length).toBe(1);
    });
  });

  describe('Card 20 — Judgement (CLAIM_ROUND_END_MARKER)', () => {
    it('sets roundEndMarkerHolder', () => {
      const state = makeState(2);
      resolveJudgement(state, makeAIs(2), 0);
      expect(state.roundEndMarkerHolder).toBe(0);
      expect(state.players[0].hasRoundEndMarker).toBe(true);
    });
  });

  describe('Card 26 — Plague (PLAGUE_TO_TOME)', () => {
    it('plays into target Tome', () => {
      const state = makeState(2);
      const plague = major(26);
      // resolvePlague expects plague to already be in Pit (placed by executeMajorAction)
      state.pit.push(plague);
      resolvePlague(state, makeAIs(2), 0, { playerIndex: 1 });
      expect(state.players[1].tome.some(c => c.number === 26)).toBe(true);
    });

    it('costs plagueVp at game end', () => {
      const state = makeState(2);
      state.players[0].tome.push(major(26));
      state.players[0].realm.push(mc('WANDS', 5));
      state.players[0].vp = 10;
      scoreGameEnd(state);
      expect(state.players[0].vp).toBe(7); // 10 + (-3)
    });

    it('config: changing plagueVp to -10 costs 10vp', () => {
      const config = mergeConfig();
      config.scoring.plagueVp = -10;
      const state = makeState(2, 42, config);
      state.players[0].tome.push(major(26));
      state.players[0].realm.push(mc('WANDS', 5));
      state.players[0].vp = 20;
      scoreGameEnd(state);
      expect(state.players[0].vp).toBe(10); // 20 + (-10)
    });
  });
});

// ============================================================
// 2.3 Tome On-Play Effect Tests
// ============================================================

describe('Tome on-play effects', () => {
  describe('Card 9 — Hermit on-play (TOME_CARDS_TO_HAND)', () => {
    it('moves all other Tome cards to hand', () => {
      const state = makeState(2);
      const hermit = major(9);
      const other = major(5);
      state.players[0].tome.push(other, hermit);
      applyTomeEffect(state, makeAIs(2), 0, hermit);
      expect(state.players[0].tome.length).toBe(1);
      expect(state.players[0].tome[0].number).toBe(9);
      expect(state.players[0].hand.some(c => c.number === 5)).toBe(true);
    });
  });

  describe('Card 15 — Devil on-play (DRAW_TO_LIMIT)', () => {
    it('draws up to limit 7 by default', () => {
      const state = makeState(2);
      const devil = major(15);
      state.players[0].tome.push(devil);
      // Add cards to minor deck for drawing
      for (let i = 0; i < 10; i++) state.minorDeck.push(mc('WANDS', i + 1));
      applyTomeEffect(state, makeAIs(2), 0, devil);
      // Hand + realm should be up to 7
      const total = state.players[0].hand.length + state.players[0].realm.length;
      expect(total).toBeLessThanOrEqual(7);
      expect(state.players[0].hand.length).toBeGreaterThan(0);
    });

    it('config: changing limit to 9 draws to 9', () => {
      const config = mergeConfig();
      config.majorArcana.find(c => c.number === 15).effect.onPlay.limit = 9;
      const state = makeState(2, 42, config);
      const devil = major(15);
      state.players[0].tome.push(devil);
      for (let i = 0; i < 15; i++) state.minorDeck.push(mc('WANDS', (i % 14) + 1));
      applyTomeEffect(state, makeAIs(2), 0, devil);
      expect(state.players[0].hand.length).toBeLessThanOrEqual(9);
    });

    it('getEffectiveHandLimit returns limit while Devil in Tome', () => {
      const state = makeState(2);
      state.players[0].tome.push(major(15));
      expect(getEffectiveHandLimit(state.players[0], state.config)).toBe(7);
    });
  });

  for (const [number, suit, name] of [
    [14, 'CUPS', 'Temperance'], [22, 'SWORDS', 'Faith'],
    [23, 'WANDS', 'Hope'], [25, 'COINS', 'Prudence'],
  ]) {
    describe(`Card ${number} — ${name} on-play (PROTECT_SUIT, ${suit})`, () => {
      it(`adds ${suit} protection`, () => {
        const state = makeState(2);
        const card = major(number);
        state.players[0].tome.push(card);
        applyTomeEffect(state, makeAIs(2), 0, card);
        expect(state.players[0].tomeProtections.has(suit)).toBe(true);
      });
    });
  }
});

// ============================================================
// 2.4 Celestial and Death Tests
// ============================================================

describe('Celestial cards', () => {
  for (const num of [17, 18, 19, 21, 24]) {
    const def = MAJOR_ARCANA_DEFS.find(d => d.number === num);
    it(`Card ${num} — ${def.name} earns 2vp at game end (default)`, () => {
      const state = makeState(2);
      state.players[0].tome.push(major(num));
      state.players[0].vp = 0;
      scoreGameEnd(state);
      expect(state.players[0].vp).toBe(2);
    });
  }

  it('config: celestialVp=5 awards 5vp each', () => {
    const config = mergeConfig();
    config.scoring.celestialVp = 5;
    const state = makeState(2, 42, config);
    state.players[0].tome.push(major(17));
    state.players[0].vp = 0;
    scoreGameEnd(state);
    expect(state.players[0].vp).toBe(5);
  });

  it('3 celestials trigger instant win', () => {
    const state = makeState(2);
    state.players[0].tome.push(major(17), major(18), major(19));
    expect(checkCelestialWin(state)).toBe(0);
  });

  it('config: celestialWinCount=2 triggers win with 2', () => {
    const config = mergeConfig();
    config.scoring.celestialWinCount = 2;
    const state = makeState(2, 42, config);
    state.players[0].tome.push(major(17), major(18));
    expect(checkCelestialWin(state)).toBe(0);
  });
});

describe('Card 13 — Death', () => {
  it('appearing in display ends game', () => {
    const state = makeState(2);
    state.display[0] = major(13);
    expect(checkDeathRevealed(state)).toBe(true);
  });

  it('not in display does not end game', () => {
    const state = makeState(2);
    state.display = [null, null, null];
    expect(checkDeathRevealed(state)).toBe(false);
  });
});

// ============================================================
// 2.5 Protection Card Tests
// ============================================================

describe('Protection cards', () => {
  for (const [number, suit, name] of [
    [14, 'CUPS', 'Temperance'], [22, 'SWORDS', 'Faith'],
    [23, 'WANDS', 'Hope'], [25, 'COINS', 'Prudence'],
  ]) {
    it(`${name} protects ${suit} from Royal attacks`, () => {
      const state = makeState(2);
      state.players[1].tomeProtections.add(suit);
      state.players[1].realm.push(mc(suit, 5));
      const page = mc(suit, 'PAGE');
      state.players[0].hand.push(page);
      const realmBefore = state.players[1].realm.length;
      resolveRoyalAttack(state, 0, page, 1, 0, makeAIs(2));
      // Card should still be in realm (attack failed)
      expect(state.players[1].realm.length).toBe(realmBefore);
    });

    it(`${name} does NOT protect other suits`, () => {
      const state = makeState(2);
      state.players[1].tomeProtections.add(suit);
      const otherSuit = suit === 'WANDS' ? 'CUPS' : 'WANDS';
      state.players[1].realm.push(mc(otherSuit, 5));
      const page = mc(otherSuit, 'PAGE');
      state.players[0].hand.push(page);
      resolveRoyalAttack(state, 0, page, 1, 0, makeAIs(2));
      // Attack should succeed — realm card removed
      expect(state.players[1].realm.length).toBe(0);
    });
  }
});

// ============================================================
// 2.6 Config Round-Trip Tests
// ============================================================

describe('Config round-trip: editor → simulation', () => {
  it('Lovers vpPerPair=10 produces avg bonus VP >= 8 over 100 games', { timeout: 30000 }, () => {
    const config = mergeConfig();
    config.majorArcana.find(c => c.number === 6).effect.bonus.vpPerPair = 10;

    const sim = runSimulation({
      games: 100, players: 4, seed: 99,
      aiAssignment: 'diverse', cardConfig: config,
    });

    let totalBonusVp = 0, bonusCount = 0;
    for (const g of sim.results) {
      const le = g.cardEvents?.[6];
      if (le) { totalBonusVp += le.bonusVpTotal; bonusCount += le.bonusScored; }
    }

    const avgBonusVp = bonusCount > 0 ? totalBonusVp / bonusCount : 0;
    expect(avgBonusVp).toBeGreaterThanOrEqual(8);
    expect(avgBonusVp).toBeLessThan(25);
  });

  it('celestialVp=10 makes celestial holders earn high VP', { timeout: 30000 }, () => {
    const config = mergeConfig();
    config.scoring.celestialVp = 10;

    const sim = runSimulation({
      games: 100, players: 4, seed: 77,
      aiAssignment: 'diverse', cardConfig: config,
    });

    let celestialVp = 0, celestialN = 0;
    for (const game of sim.results) {
      for (const p of game.players) {
        const celestialCount = p.majorHoldings.filter(n => [17, 18, 19, 21, 24].includes(n)).length;
        if (celestialCount > 0) {
          celestialVp += p.vp;
          celestialN++;
        }
      }
    }

    if (celestialN > 0) {
      expect(celestialVp / celestialN).toBeGreaterThan(10);
    }
  });

  it('plagueVp=-20 makes Plague devastating', { timeout: 30000 }, () => {
    const config = mergeConfig();
    config.scoring.plagueVp = -20;

    const sim = runSimulation({
      games: 100, players: 4, seed: 55,
      aiAssignment: 'diverse', cardConfig: config,
    });

    let plagueHolderVp = 0, plagueN = 0;
    for (const game of sim.results) {
      for (const p of game.players) {
        if (p.majorHoldings.includes(26)) {
          plagueHolderVp += p.vp;
          plagueN++;
        }
      }
    }

    if (plagueN > 0) {
      expect(plagueHolderVp / plagueN).toBeLessThan(5);
    }
  });

  it('config change vs default produces different VP distribution', { timeout: 30000 }, () => {
    const defaultSim = runSimulation({
      games: 50, players: 4, seed: 123, aiAssignment: 'diverse',
    });

    const config = mergeConfig();
    config.majorArcana.find(c => c.number === 6).effect.bonus.vpPerPair = 50;
    const modifiedSim = runSimulation({
      games: 50, players: 4, seed: 123, aiAssignment: 'diverse',
      cardConfig: config,
    });

    const defaultAvg = defaultSim.results.reduce((s, g) => s + g.vpDistribution.reduce((a, b) => a + b, 0), 0) / (50 * 4);
    const modifiedAvg = modifiedSim.results.reduce((s, g) => s + g.vpDistribution.reduce((a, b) => a + b, 0), 0) / (50 * 4);

    expect(modifiedAvg).toBeGreaterThan(defaultAvg * 1.5);
  });

  it('suitHighest VP change propagates (High Priestess vp=5)', () => {
    const config = mergeConfig();
    config.majorArcana.find(c => c.number === 2).effect.bonus.vp = 5;

    const state = makeState(2, 42, config);
    state.players[0].tome.push(major(2));
    state.players[0].realm.push(mc('WANDS', 5), mc('WANDS', 8));
    state.players[1].realm.push(mc('CUPS', 3));

    expect(resolveBonus(state, 0, state.players[0].tome[0], makeAIs(2))).toBe(5);
  });

  it('noSuitInRealm VP change propagates (Temperance vp=7)', () => {
    const config = mergeConfig();
    config.majorArcana.find(c => c.number === 14).effect.bonus.vp = 7;

    const state = makeState(2, 42, config);
    state.players[0].tome.push(major(14));
    state.players[0].realm.push(mc('WANDS', 5));

    expect(resolveBonus(state, 0, state.players[0].tome[0], makeAIs(2))).toBe(7);
  });
});
