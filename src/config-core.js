/**
 * Core configuration for New Arcana (pure JS, no Node dependencies).
 * Browser-safe — can be imported by Vite/React client.
 */

/**
 * Get the built-in default config (matches all current hardcoded values).
 * @returns {object} Default config
 */
export function getDefaultConfig() {
  return {
    gameRules: {
      handSizeLimit: 6,
      devilHandSizeLimit: 7,
      tomeCapacity: 3,
      realmTrigger: 5,
      displaySlots: 3,
      maxTurnsPerRound: 50,
      maxRounds: 20,
      initialDealCount: 5,
      roundDealCount: 6,
    },
    buyPrices: {
      draw: 6,
      display0: 7,
      display1: 8,
      display2: 9,
      discard: 10,
    },
    maxPaymentCards: 3,
    scoring: {
      celestialVp: 2,
      plagueVp: -3,
      celestialWinCount: 3,
      potInitialPerPlayer: 1,
      potGrowth: 1,
    },
    majorArcana: [
      { number: 0,  name: 'The Fool',           category: 'bonus-round', keywords: ['bonus'],     suit: null, effect: { type: 'bonus', bonus: { bonusType: 'foolDuplicate' } } },
      { number: 1,  name: 'The Magician',        category: 'bonus-round', keywords: ['bonus'],     suit: null, effect: { type: 'bonus', bonus: { bonusType: 'suitMajority', requiresStrictAdvantage: true, countWilds: true, vp: 1, requiresChoice: true } } },
      { number: 2,  name: 'The High Priestess',  category: 'bonus-round', keywords: ['bonus'],     suit: 'WANDS', effect: { type: 'bonus', bonus: { bonusType: 'suitHighest', suit: 'WANDS', countWilds: false, allowTie: true, vp: 1 } } },
      { number: 3,  name: 'The Empress',          category: 'bonus-round', keywords: ['bonus'],     suit: 'CUPS', effect: { type: 'bonus', bonus: { bonusType: 'suitHighest', suit: 'CUPS', countWilds: false, allowTie: true, vp: 1 } } },
      { number: 4,  name: 'The Emperor',          category: 'bonus-round', keywords: ['bonus'],     suit: 'COINS', effect: { type: 'bonus', bonus: { bonusType: 'suitHighest', suit: 'COINS', countWilds: false, allowTie: true, vp: 1 } } },
      { number: 5,  name: 'The Hierophant',       category: 'tome',        keywords: ['tome'],      suit: null, effect: { type: 'tome', onPlay: null, bonus: { bonusType: 'hierophant_blessing' } } },
      { number: 6,  name: 'The Lovers',           category: 'bonus-round', keywords: ['bonus'],     suit: null, effect: { type: 'bonus', bonus: { bonusType: 'pairCounting', vpPerPair: 1 } } },
      { number: 7,  name: 'The Chariot',          category: 'action',      keywords: ['action'],    suit: null, effect: { type: 'action', action: 'MOVE_CELESTIAL_TO_TOME' } },
      { number: 8,  name: 'Strength',             category: 'action',      keywords: ['action'],    suit: null, effect: { type: 'action', action: 'MOVE_MAJOR_TO_REALM' } },
      { number: 9,  name: 'The Hermit',           category: 'tome',        keywords: ['tome', 'bonus'], suit: null, effect: { type: 'tome', onPlay: { action: 'TOME_CARDS_TO_HAND' }, bonus: { bonusType: 'hermitExclusive', vp: 1 } } },
      { number: 10, name: 'Wheel of Fortune',     category: 'action',      keywords: ['action'],    suit: null, effect: { type: 'action', action: 'WHEEL_OF_FORTUNE' } },
      { number: 11, name: 'Justice',              category: 'bonus-round', keywords: ['bonus'],     suit: 'SWORDS', effect: { type: 'bonus', bonus: { bonusType: 'suitHighest', suit: 'SWORDS', countWilds: false, allowTie: true, vp: 1 } } },
      { number: 12, name: 'The Hanged Man',       category: 'action',      keywords: ['action'],    suit: null, effect: { type: 'action', action: 'STEAL_FROM_TOME' } },
      { number: 13, name: 'Death',                category: 'action',      keywords: ['game-end'],  suit: null, effect: { type: 'game_end_trigger', trigger: 'death_revealed' } },
      { number: 14, name: 'Temperance',           category: 'tome',        keywords: ['tome', 'bonus'], suit: 'CUPS', effect: { type: 'tome', onPlay: { action: 'PROTECT_SUIT', suit: 'CUPS' }, bonus: { bonusType: 'noSuitInRealm', suit: 'CUPS', vp: 1 } } },
      { number: 15, name: 'The Devil',            category: 'tome',        keywords: ['tome'],      suit: null, effect: { type: 'tome', onPlay: { action: 'DRAW_TO_LIMIT', limit: 7 }, bonus: null } },
      { number: 16, name: 'The Tower',            category: 'action',      keywords: ['action'],    suit: null, effect: { type: 'action', action: 'TOWER_DESTROY' } },
      { number: 17, name: 'The Star',             category: 'celestial',   keywords: ['celestial'], suit: null, effect: { type: 'celestial', vpAtGameEnd: 2, winConditionGroup: 'celestial' } },
      { number: 18, name: 'The Moon',             category: 'celestial',   keywords: ['celestial'], suit: null, effect: { type: 'celestial', vpAtGameEnd: 2, winConditionGroup: 'celestial' } },
      { number: 19, name: 'The Sun',              category: 'celestial',   keywords: ['celestial'], suit: null, effect: { type: 'celestial', vpAtGameEnd: 2, winConditionGroup: 'celestial' } },
      { number: 20, name: 'Judgement',            category: 'action',      keywords: ['action'],    suit: null, effect: { type: 'action', action: 'CLAIM_ROUND_END_MARKER' } },
      { number: 21, name: 'The World',            category: 'celestial',   keywords: ['celestial'], suit: null, effect: { type: 'celestial', vpAtGameEnd: 2, winConditionGroup: 'celestial' } },
      { number: 22, name: 'Faith',                category: 'tome',        keywords: ['tome', 'bonus'], suit: 'SWORDS', effect: { type: 'tome', onPlay: { action: 'PROTECT_SUIT', suit: 'SWORDS' }, bonus: { bonusType: 'noSuitInRealm', suit: 'SWORDS', vp: 1 } } },
      { number: 23, name: 'Hope',                 category: 'tome',        keywords: ['tome', 'bonus'], suit: 'WANDS', effect: { type: 'tome', onPlay: { action: 'PROTECT_SUIT', suit: 'WANDS' }, bonus: { bonusType: 'noSuitInRealm', suit: 'WANDS', vp: 1 } } },
      { number: 24, name: 'The Universe',         category: 'celestial',   keywords: ['celestial'], suit: null, effect: { type: 'celestial', vpAtGameEnd: 2, winConditionGroup: 'celestial' } },
      { number: 25, name: 'Prudence',             category: 'tome',        keywords: ['tome', 'bonus'], suit: 'COINS', effect: { type: 'tome', onPlay: { action: 'PROTECT_SUIT', suit: 'COINS' }, bonus: { bonusType: 'noSuitInRealm', suit: 'COINS', vp: 1 } } },
      { number: 26, name: 'Plague',               category: 'action',      keywords: ['action'],    suit: null, effect: { type: 'action', action: 'PLAGUE_TO_TOME', vpPenalty: -3 } },
    ],
  };
}

/**
 * Deep-merge a user config over defaults. Partial configs work —
 * only provided keys are overridden.
 * @param {object} userConfig - Partial config from user
 * @returns {object} Merged config
 */
export function mergeConfig(userConfig) {
  const defaults = getDefaultConfig();
  if (!userConfig) return defaults;
  return deepMerge(defaults, userConfig);
}

/**
 * Deep-merge source into target (returns new object).
 * Arrays are replaced, not merged.
 */
export function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] !== null &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      typeof target[key] === 'object' &&
      target[key] !== null &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}
