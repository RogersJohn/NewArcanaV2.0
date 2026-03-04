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
    bonusCards: {
      1:  { bonusType: 'suitMajority', requiresStrictAdvantage: true, countWilds: true, vp: 1, requiresChoice: true },
      2:  { bonusType: 'suitHighest', suit: 'WANDS',  countWilds: false, allowTie: true, vp: 1 },
      3:  { bonusType: 'suitHighest', suit: 'CUPS',   countWilds: false, allowTie: true, vp: 1 },
      4:  { bonusType: 'suitHighest', suit: 'COINS',  countWilds: false, allowTie: true, vp: 1 },
      6:  { bonusType: 'pairCounting', vpPerPair: 1 },
      9:  { bonusType: 'hermitExclusive', vp: 1 },
      11: { bonusType: 'suitHighest', suit: 'SWORDS', countWilds: false, allowTie: true, vp: 1 },
      14: { bonusType: 'noSuitInRealm', suit: 'CUPS',   vp: 1 },
      22: { bonusType: 'noSuitInRealm', suit: 'SWORDS', vp: 1 },
      23: { bonusType: 'noSuitInRealm', suit: 'WANDS',  vp: 1 },
      25: { bonusType: 'noSuitInRealm', suit: 'COINS',  vp: 1 },
    },
    protectionMap: {
      14: 'CUPS',
      22: 'SWORDS',
      23: 'WANDS',
      25: 'COINS',
    },
    majorArcana: [
      { number: 0,  name: 'The Fool',           category: 'bonus-round', keywords: ['bonus'],     suit: null },
      { number: 1,  name: 'The Magician',        category: 'bonus-round', keywords: ['bonus'],     suit: null },
      { number: 2,  name: 'The High Priestess',  category: 'bonus-round', keywords: ['bonus'],     suit: 'WANDS' },
      { number: 3,  name: 'The Empress',          category: 'bonus-round', keywords: ['bonus'],     suit: 'CUPS' },
      { number: 4,  name: 'The Emperor',          category: 'bonus-round', keywords: ['bonus'],     suit: 'COINS' },
      { number: 5,  name: 'The Hierophant',       category: 'tome',        keywords: ['tome'],      suit: null },
      { number: 6,  name: 'The Lovers',           category: 'bonus-round', keywords: ['bonus'],     suit: null },
      { number: 7,  name: 'The Chariot',          category: 'action',      keywords: ['action'],    suit: null },
      { number: 8,  name: 'Strength',             category: 'action',      keywords: ['action'],    suit: null },
      { number: 9,  name: 'The Hermit',           category: 'tome',        keywords: ['tome', 'bonus'], suit: null },
      { number: 10, name: 'Wheel of Fortune',     category: 'action',      keywords: ['action'],    suit: null },
      { number: 11, name: 'Justice',              category: 'bonus-round', keywords: ['bonus'],     suit: 'SWORDS' },
      { number: 12, name: 'The Hanged Man',       category: 'action',      keywords: ['action'],    suit: null },
      { number: 13, name: 'Death',                category: 'action',      keywords: ['game-end'],  suit: null },
      { number: 14, name: 'Temperance',           category: 'tome',        keywords: ['tome', 'bonus'], suit: 'CUPS' },
      { number: 15, name: 'The Devil',            category: 'tome',        keywords: ['tome'],      suit: null },
      { number: 16, name: 'The Tower',            category: 'action',      keywords: ['action'],    suit: null },
      { number: 17, name: 'The Star',             category: 'celestial',   keywords: ['celestial'], suit: null },
      { number: 18, name: 'The Moon',             category: 'celestial',   keywords: ['celestial'], suit: null },
      { number: 19, name: 'The Sun',              category: 'celestial',   keywords: ['celestial'], suit: null },
      { number: 20, name: 'Judgement',            category: 'action',      keywords: ['action'],    suit: null },
      { number: 21, name: 'The World',            category: 'celestial',   keywords: ['celestial'], suit: null },
      { number: 22, name: 'Faith',                category: 'tome',        keywords: ['tome', 'bonus'], suit: 'SWORDS' },
      { number: 23, name: 'Hope',                 category: 'tome',        keywords: ['tome', 'bonus'], suit: 'WANDS' },
      { number: 24, name: 'The Universe',         category: 'celestial',   keywords: ['celestial'], suit: null },
      { number: 25, name: 'Prudence',             category: 'tome',        keywords: ['tome', 'bonus'], suit: 'COINS' },
      { number: 26, name: 'Plague',               category: 'action',      keywords: ['action'],    suit: null },
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
