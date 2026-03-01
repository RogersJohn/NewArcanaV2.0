/**
 * Card creation, deck building, and constants for New Arcana.
 */

export const SUITS = ['WANDS', 'CUPS', 'SWORDS', 'COINS'];

export const RANKS = ['ACE', 2, 3, 4, 5, 6, 7, 8, 9, 10, 'PAGE', 'KNIGHT', 'QUEEN', 'KING'];

/** Map rank to numeric value. Ace = 1, 2-10 face value, Page=11, Knight=12, Queen=13, King=14 */
export const RANK_VALUES = {
  'ACE': 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10,
  'PAGE': 11, 'KNIGHT': 12, 'QUEEN': 13, 'KING': 14
};

const ROYAL_RANKS = new Set(['PAGE', 'KNIGHT', 'QUEEN', 'KING']);

/**
 * Major Arcana definitions: number, name, category, keywords, associated suit (if any).
 * Categories: 'tome', 'action', 'celestial', 'bonus-round', 'bonus-game'
 */
export const MAJOR_ARCANA_DEFS = [
  { number: 0, name: 'The Fool', category: 'bonus-round', keywords: ['bonus'], suit: null },
  { number: 1, name: 'The Magician', category: 'bonus-round', keywords: ['bonus'], suit: null },
  { number: 2, name: 'The High Priestess', category: 'bonus-round', keywords: ['bonus'], suit: 'WANDS' },
  { number: 3, name: 'The Empress', category: 'bonus-round', keywords: ['bonus'], suit: 'CUPS' },
  { number: 4, name: 'The Emperor', category: 'bonus-round', keywords: ['bonus'], suit: 'COINS' },
  { number: 5, name: 'The Hierophant', category: 'tome', keywords: ['tome'], suit: null },
  { number: 6, name: 'The Lovers', category: 'bonus-round', keywords: ['bonus'], suit: null },
  { number: 7, name: 'The Chariot', category: 'action', keywords: ['action'], suit: null },
  { number: 8, name: 'Strength', category: 'action', keywords: ['action'], suit: null },
  { number: 9, name: 'The Hermit', category: 'tome', keywords: ['tome', 'bonus'], suit: null },
  { number: 10, name: 'Wheel of Fortune', category: 'action', keywords: ['action'], suit: null },
  { number: 11, name: 'Justice', category: 'bonus-round', keywords: ['bonus'], suit: 'SWORDS' },
  { number: 12, name: 'The Hanged Man', category: 'action', keywords: ['action'], suit: null },
  { number: 13, name: 'Death', category: 'action', keywords: ['game-end'], suit: null },
  { number: 14, name: 'Temperance', category: 'tome', keywords: ['tome', 'bonus'], suit: 'CUPS' },
  { number: 15, name: 'The Devil', category: 'tome', keywords: ['tome'], suit: null },
  { number: 16, name: 'The Tower', category: 'action', keywords: ['action'], suit: null },
  { number: 17, name: 'The Star', category: 'celestial', keywords: ['celestial'], suit: null },
  { number: 18, name: 'The Moon', category: 'celestial', keywords: ['celestial'], suit: null },
  { number: 19, name: 'The Sun', category: 'celestial', keywords: ['celestial'], suit: null },
  { number: 20, name: 'Judgement', category: 'action', keywords: ['action'], suit: null },
  { number: 21, name: 'The World', category: 'celestial', keywords: ['celestial'], suit: null },
  // Extended (6-player)
  { number: 22, name: 'Faith', category: 'tome', keywords: ['tome', 'bonus'], suit: 'SWORDS' },
  { number: 23, name: 'Hope', category: 'tome', keywords: ['tome', 'bonus'], suit: 'WANDS' },
  { number: 24, name: 'The Universe', category: 'celestial', keywords: ['celestial'], suit: null },
  { number: 25, name: 'Prudence', category: 'tome', keywords: ['tome', 'bonus'], suit: 'COINS' },
  { number: 26, name: 'Plague', category: 'action', keywords: ['action'], suit: null },
];

/** Protection card mapping: card number -> suit it protects */
export const PROTECTION_MAP = {
  14: 'CUPS',       // Temperance
  22: 'SWORDS',     // Faith
  23: 'WANDS',      // Hope
  25: 'COINS',      // Prudence
};

let nextId = 0;

/**
 * Create a Minor Arcana card.
 * @param {string} suit - One of SUITS
 * @param {string|number} rank - One of RANKS
 * @returns {object} Minor card object
 */
export function createMinorCard(suit, rank) {
  const numericRank = RANK_VALUES[rank];
  return {
    id: nextId++,
    type: 'minor',
    suit,
    rank,
    numericRank,
    isRoyal: ROYAL_RANKS.has(rank),
    purchaseValue: numericRank,
  };
}

/**
 * Create a Major Arcana card.
 * @param {number} number - Card number (0-26)
 * @param {string} name - Card name
 * @param {string} category - Card category
 * @param {string[]} keywords - Card keywords
 * @returns {object} Major card object
 */
export function createMajorCard(number, name, category, keywords) {
  const def = MAJOR_ARCANA_DEFS.find(d => d.number === number);
  return {
    id: nextId++,
    type: 'major',
    number,
    name,
    category,
    keywords: keywords || def?.keywords || [],
    suit: def?.suit || null,
    purchaseValue: number,
  };
}

/**
 * Create the full 56-card Minor Arcana deck.
 * @returns {object[]} Array of minor cards
 */
export function createMinorDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push(createMinorCard(suit, rank));
    }
  }
  return deck;
}

/**
 * Create the Major Arcana deck.
 * @param {boolean} extended - If true, include cards 22-26 for 6-player game
 * @param {object[]} [majorDefs] - Optional major arcana definitions from config
 * @returns {object[]} Array of major cards
 */
export function createMajorDeck(extended = false, majorDefs) {
  const defs = majorDefs || MAJOR_ARCANA_DEFS;
  const maxNumber = extended ? 26 : 21;
  return defs
    .filter(def => def.number <= maxNumber)
    .map(def => createMajorCard(def.number, def.name, def.category, def.keywords));
}

/**
 * Fisher-Yates in-place shuffle.
 * @param {any[]} array - Array to shuffle in place
 * @param {object} [rng] - Optional SeededRNG instance; falls back to Math.random()
 * @returns {any[]} The same array, shuffled
 */
export function shuffle(array, rng) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = rng
      ? rng.nextInt(i + 1)
      : Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Check if a card is a Royal (Page, Knight, Queen, King).
 * @param {object} card
 * @returns {boolean}
 */
export function isRoyal(card) {
  return card.type === 'minor' && ROYAL_RANKS.has(card.rank);
}

/**
 * Check if a card is a Celestial Major Arcana.
 * @param {object} card
 * @returns {boolean}
 */
export function isCelestial(card) {
  return card.type === 'major' && card.category === 'celestial';
}

/**
 * Check if a card is a Tome card.
 * @param {object} card
 * @returns {boolean}
 */
export function isTome(card) {
  return card.type === 'major' && (card.category === 'tome' || card.keywords.includes('bonus'));
}

/**
 * Check if a card can go to Tome (tome category, bonus category, or celestial).
 * @param {object} card
 * @returns {boolean}
 */
export function canPlayToTome(card) {
  if (card.type !== 'major') return false;
  return card.category === 'tome' || card.category === 'bonus-round' || card.category === 'celestial';
}

/**
 * Get human-readable card name.
 * @param {object} card
 * @returns {string}
 */
export function cardName(card) {
  if (card.type === 'minor') {
    return `${card.rank} of ${card.suit}`;
  }
  return `${card.name} (${card.number})`;
}

/**
 * Get the purchase value of a card.
 * @param {object} card
 * @returns {number}
 */
export function purchaseValue(card) {
  return card.purchaseValue;
}

/**
 * Reset the ID counter (useful for testing).
 */
export function resetIdCounter() {
  nextId = 0;
}
