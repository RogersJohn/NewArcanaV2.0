import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/state.js';
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

    it('matches the explicit protectionMap in config', () => {
      const state = makeState();
      const derived = deriveProtectionMap(state.config);
      const explicit = state.config.protectionMap;
      for (const [num, suit] of Object.entries(explicit)) {
        expect(derived[Number(num)]).toBe(suit);
      }
    });
  });

  describe('Custom card support', () => {
    it('a custom card with PROTECT_SUIT appears in derived protection map', () => {
      const state = makeState();
      // Add a custom card
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
  });
});
