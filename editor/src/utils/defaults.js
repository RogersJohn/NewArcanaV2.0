import { getDefaultConfig } from '../../../src/config-core.js';

export function getDefaults() {
  return getDefaultConfig();
}

export function newCard(number) {
  return {
    number,
    name: '',
    category: 'action',
    keywords: [],
    suit: null,
    effect: { type: 'action', action: 'MOVE_CELESTIAL_TO_TOME' },
  };
}

export const CATEGORIES = ['action', 'tome', 'celestial', 'bonus-round'];
export const SUITS = [null, 'WANDS', 'CUPS', 'SWORDS', 'COINS'];
export const ACTION_TYPES = [
  'MOVE_CELESTIAL_TO_TOME', 'MOVE_MAJOR_TO_REALM', 'WHEEL_OF_FORTUNE',
  'STEAL_FROM_TOME', 'TOWER_DESTROY', 'CLAIM_ROUND_END_MARKER', 'PLAGUE_TO_TOME',
];
export const TOME_ONPLAY_TYPES = [null, 'PROTECT_SUIT', 'DRAW_TO_LIMIT', 'TOME_CARDS_TO_HAND'];
export const BONUS_TYPES = [
  'foolDuplicate', 'suitMajority', 'suitHighest', 'pairCounting',
  'hermitExclusive', 'noSuitInRealm', 'hierophant_blessing',
];
