import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/state.js';
import { createMinorCard } from '../src/cards.js';
import { setup, playGame } from '../src/engine.js';
import { createAIs } from '../src/ai/index.js';
import { resolveBonus } from '../src/scoring.js';
import { resolveTomeOnPlayGen } from '../src/effect-resolver.js';
import {
  isDeathCard, isPlagueCard, isHierophantCard, isHermitCard,
  getActionHandler, getTomeOnPlayHandler, deriveProtectionMap, getCardEffect,
} from '../src/effect-resolver.js';

function makeState(extended = true) {
  return createInitialState(4, extended, 42);
}

/** Find a major card by number across all locations in the state. */
function findMajor(state, number) {
  return state.majorDeck.find(c => c.number === number)
    || state.majorDiscard.find(c => c.number === number)
    || state.display.find(c => c && c.number === number)
    || state.players.flatMap(p => [...p.hand, ...p.tome, ...p.realm]).find(c => c.number === number);
}

describe('Effect Resolver', () => {
  describe('Card identification', () => {
    it('isDeathCard identifies Death by effect, not number', () => {
      const state = makeState();
      const death = findMajor(state, 13);
      expect(isDeathCard(state, death)).toBe(true);
      const nonDeath = findMajor(state, 7);
      expect(isDeathCard(state, nonDeath)).toBe(false);
      expect(isDeathCard(state, null)).toBe(false);
    });

    it('isPlagueCard identifies Plague by effect', () => {
      const state = makeState();
      const plague = findMajor(state, 26);
      expect(isPlagueCard(state, plague)).toBe(true);
      const nonPlague = findMajor(state, 10);
      expect(isPlagueCard(state, nonPlague)).toBe(false);
    });

    it('isHierophantCard identifies Hierophant by effect', () => {
      const state = makeState();
      const hierophant = findMajor(state, 5);
      expect(isHierophantCard(state, hierophant)).toBe(true);
      const nonH = findMajor(state, 6);
      expect(isHierophantCard(state, nonH)).toBe(false);
    });

    it('isHermitCard identifies Hermit by effect', () => {
      const state = makeState();
      const hermit = findMajor(state, 9);
      expect(isHermitCard(state, hermit)).toBe(true);
      const nonHermit = findMajor(state, 15);
      expect(isHermitCard(state, nonHermit)).toBe(false);
    });
  });

  describe('Action dispatch', () => {
    it('dispatches Chariot correctly', () => {
      const state = makeState();
      const chariot = findMajor(state, 7);
      expect(getActionHandler(state, chariot)).toBe('resolveChariot');
    });

    it('dispatches Strength correctly', () => {
      const state = makeState();
      const strength = findMajor(state, 8);
      expect(getActionHandler(state, strength)).toBe('resolveStrength');
    });

    it('dispatches Wheel of Fortune correctly', () => {
      const state = makeState();
      const wheel = findMajor(state, 10);
      expect(getActionHandler(state, wheel)).toBe('resolveWheelOfFortune');
    });

    it('dispatches Hanged Man correctly', () => {
      const state = makeState();
      const hm = findMajor(state, 12);
      expect(getActionHandler(state, hm)).toBe('resolveHangedMan');
    });

    it('dispatches Tower correctly', () => {
      const state = makeState();
      const tower = findMajor(state, 16);
      expect(getActionHandler(state, tower)).toBe('resolveTower');
    });

    it('dispatches Judgement correctly', () => {
      const state = makeState();
      const judgement = findMajor(state, 20);
      expect(getActionHandler(state, judgement)).toBe('resolveJudgement');
    });

    it('dispatches Plague correctly', () => {
      const state = makeState();
      const plague = findMajor(state, 26);
      expect(getActionHandler(state, plague)).toBe('resolvePlague');
    });

    it('returns null for non-action cards', () => {
      const state = makeState();
      const celestial = findMajor(state, 17);
      expect(getActionHandler(state, celestial)).toBe(null);
    });
  });

  describe('Tome on-play dispatch', () => {
    it('dispatches Hermit on-play correctly', () => {
      const state = makeState();
      const hermit = findMajor(state, 9);
      expect(getTomeOnPlayHandler(state, hermit)).toBe('hermitOnPlay');
    });

    it('dispatches Devil on-play correctly', () => {
      const state = makeState();
      const devil = findMajor(state, 15);
      expect(getTomeOnPlayHandler(state, devil)).toBe('devilOnPlay');
    });

    it('dispatches protection cards on-play correctly', () => {
      const state = makeState();
      for (const num of [14, 22, 23, 25]) {
        const card = findMajor(state, num);
        expect(getTomeOnPlayHandler(state, card)).toBe('protectionOnPlay');
      }
    });

    it('returns null for Hierophant (no on-play effect)', () => {
      const state = makeState();
      const hierophant = findMajor(state, 5);
      expect(getTomeOnPlayHandler(state, hierophant)).toBe(null);
    });
  });

  describe('Protection map derivation', () => {
    it('derives protection map from card effect data', () => {
      const state = makeState();
      const map = deriveProtectionMap(state.config);
      expect(map[14]).toBe('CUPS');
      expect(map[22]).toBe('SWORDS');
      expect(map[23]).toBe('WANDS');
      expect(map[25]).toBe('COINS');
    });

    it('protectionMap on state is derived automatically from effects', () => {
      const state = makeState();
      // protectionMap is now derived in createInitialState
      expect(state.config.protectionMap[14]).toBe('CUPS');
      expect(state.config.protectionMap[22]).toBe('SWORDS');
      expect(state.config.protectionMap[23]).toBe('WANDS');
      expect(state.config.protectionMap[25]).toBe('COINS');
    });
  });

  describe('Custom card support', () => {
    it('a custom card with PROTECT_SUIT appears in derived protection map', () => {
      const state = makeState();
      state.config.majorArcana.push({
        number: 99,
        name: 'Custom Shield',
        category: 'tome',
        keywords: ['tome'],
        suit: 'WANDS',
        effect: {
          type: 'tome',
          onPlay: { action: 'PROTECT_SUIT', suit: 'WANDS' },
          bonus: null,
        },
      });
      const map = deriveProtectionMap(state.config);
      expect(map[99]).toBe('WANDS');
    });

    it('custom PROTECT_SUIT card registers via createInitialState', () => {
      const customConfig = {
        majorArcana: [
          ...createInitialState(4, true, 1).config.majorArcana,
          {
            number: 99, name: 'Custom Shield', category: 'tome',
            keywords: ['tome'], suit: 'COINS',
            effect: { type: 'tome', onPlay: { action: 'PROTECT_SUIT', suit: 'COINS' }, bonus: null },
          },
        ],
      };
      const state = createInitialState(4, true, 1, customConfig);
      expect(state.config.protectionMap[99]).toBe('COINS');
    });

    it('custom suitHighest bonus card scores VP end-to-end', () => {
      const state = makeState();
      state.config.majorArcana.push({
        number: 99, name: 'Custom Bonus', category: 'bonus-round',
        keywords: ['bonus'], suit: 'WANDS',
        effect: { type: 'bonus', bonus: { bonusType: 'suitHighest', suit: 'WANDS', countWilds: false, allowTie: true, vp: 2 } },
      });
      const customCard = {
        id: 9999, type: 'major', number: 99, name: 'Custom Bonus',
        category: 'bonus-round', keywords: ['bonus'], suit: 'WANDS', purchaseValue: 99,
        effect: { type: 'bonus', bonus: { bonusType: 'suitHighest', suit: 'WANDS', countWilds: false, allowTie: true, vp: 2 } },
      };
      state.players[0].tome.push(customCard);
      state.players[0].realm.push(createMinorCard('WANDS', 5));
      const ais = createAIs(4, 'random', state.rng);
      const vp = resolveBonus(state, 0, customCard, ais);
      expect(vp).toBe(2);
    });

    it('custom suitMajority bonus requires strict advantage', () => {
      const state = makeState();
      state.config.majorArcana.push({
        number: 98, name: 'Custom Majority', category: 'bonus-round',
        keywords: ['bonus'], suit: null,
        effect: { type: 'bonus', bonus: { bonusType: 'suitMajority', requiresStrictAdvantage: true, countWilds: true, vp: 2, requiresChoice: true } },
      });
      const customCard = {
        id: 9998, type: 'major', number: 98, name: 'Custom Majority',
        category: 'bonus-round', keywords: ['bonus'], suit: null, purchaseValue: 98,
        effect: { type: 'bonus', bonus: { bonusType: 'suitMajority', requiresStrictAdvantage: true, countWilds: true, vp: 2, requiresChoice: true } },
      };
      state.players[0].tome.push(customCard);
      // Give player 0 two WANDS, player 1 two WANDS (tied — should score 0)
      state.players[0].realm.push(createMinorCard('WANDS', 3), createMinorCard('WANDS', 4));
      state.players[1].realm.push(createMinorCard('WANDS', 5), createMinorCard('WANDS', 6));
      // resolveBonusGen for suitMajority yields for suit choice, then checks counts
      // The sync wrapper uses AI to choose suit — RandomAI picks randomly
      const ais = createAIs(4, 'random', state.rng);
      const vp = resolveBonus(state, 0, customCard, ais);
      // Tied in WANDS — should be 0 regardless of which suit AI picks (all others are 0 too)
      expect(vp).toBe(0);
    });

    it('config change affects scoring (Empress VP from 1 to 3)', () => {
      const state = makeState();
      // Find and modify the Empress in config
      const empressDef = state.config.majorArcana.find(m => m.number === 3);
      empressDef.effect.bonus.vp = 3;
      const empress = findMajor(state, 3);
      state.players[0].tome.push(empress);
      state.players[0].realm.push(createMinorCard('CUPS', 5));
      const ais = createAIs(4, 'random', state.rng);
      const vp = resolveBonus(state, 0, empress, ais);
      expect(vp).toBe(3);
    });
  });

  describe('Edge cases', () => {
    it('getCardEffect returns null for minor cards', () => {
      const state = makeState();
      const minor = createMinorCard('CUPS', 5);
      expect(getCardEffect(state, minor)).toBe(null);
    });

    it('isDeathCard and isPlagueCard return false for minor cards', () => {
      const state = makeState();
      const minor = createMinorCard('CUPS', 5);
      expect(isDeathCard(state, minor)).toBe(false);
      expect(isPlagueCard(state, minor)).toBe(false);
    });

    it('getActionHandler returns null for card with no effect', () => {
      const state = makeState();
      const fakeCard = { id: 9999, type: 'major', number: 999, name: 'Unknown', category: 'action', keywords: [] };
      expect(getActionHandler(state, fakeCard)).toBe(null);
    });

    it('getTomeOnPlayHandler returns null for card with no effect', () => {
      const state = makeState();
      const fakeCard = { id: 9999, type: 'major', number: 999, name: 'Unknown', category: 'tome', keywords: [] };
      expect(getTomeOnPlayHandler(state, fakeCard)).toBe(null);
    });

    it('resolveTomeOnPlayGen for Devil draws cards', () => {
      const state = makeState();
      const devil = findMajor(state, 15);
      state.players[0].tome.push(devil);
      state.players[0].hand = [];
      state.players[0].realm = [];
      // Run the generator to completion
      const gen = resolveTomeOnPlayGen(state, 0, devil);
      let result = gen.next();
      while (!result.done) result = gen.next();
      // Player should now have cards drawn up to limit 7
      expect(state.players[0].hand.length).toBeGreaterThan(0);
      expect(state.players[0].hand.length).toBeLessThanOrEqual(7);
    });

    it('resolveTomeOnPlayGen for protection card adds protection', () => {
      const state = makeState();
      const temperance = findMajor(state, 14);
      state.players[0].tome.push(temperance);
      const gen = resolveTomeOnPlayGen(state, 0, temperance);
      let result = gen.next();
      while (!result.done) result = gen.next();
      expect(state.players[0].tomeProtections.has('CUPS')).toBe(true);
    });
  });

  describe('Deterministic reproducibility', () => {
    it('same seed produces identical game results', () => {
      function runGame(seed) {
        const state = createInitialState(4, false, seed);
        const ais = createAIs(4, 'diverse', state.rng);
        for (let pi = 0; pi < 4; pi++) state.players[pi].name = `P${pi}`;
        setup(state, ais);
        playGame(state, ais);
        return {
          vpDist: state.players.map(p => p.vp),
          endReason: state.gameEndReason,
          rounds: state.roundNumber,
        };
      }
      const r1 = runGame(12345);
      const r2 = runGame(12345);
      expect(r1).toEqual(r2);
    });
  });
});
