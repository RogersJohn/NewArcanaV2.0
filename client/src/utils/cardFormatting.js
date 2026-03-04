/**
 * Card display formatting utilities for the UI.
 */

export const SUIT_SYMBOLS = {
  WANDS: '\u2663',   // ♣
  CUPS: '\u2665',    // ♥
  SWORDS: '\u2660',  // ♠
  COINS: '\u2666',   // ♦
};

export const SUIT_COLORS = {
  WANDS: '#2d8a4e',   // green
  CUPS: '#c0392b',    // red
  SWORDS: '#2c3e50',  // dark blue
  COINS: '#d4a017',   // gold
};

export const CATEGORY_COLORS = {
  'bonus-round': '#8e44ad',   // purple
  'tome': '#2980b9',          // blue
  'action': '#c0392b',        // red
  'celestial': '#f39c12',     // gold
};

/**
 * Format a card's rank for display.
 */
export function formatRank(rank) {
  if (typeof rank === 'number') return String(rank);
  // ACE, PAGE, KNIGHT, QUEEN, KING — capitalize first letter
  return rank.charAt(0) + rank.slice(1).toLowerCase();
}

/**
 * Get a short display name for a card.
 */
export function cardDisplayName(card) {
  if (!card) return '';
  if (card.type === 'minor') {
    return `${formatRank(card.rank)} of ${card.suit.charAt(0) + card.suit.slice(1).toLowerCase()}`;
  }
  return card.name;
}

/**
 * Get a compact label for a card (for tight spaces).
 */
export function cardShortLabel(card) {
  if (!card) return '';
  if (card.type === 'minor') {
    const r = typeof card.rank === 'number' ? card.rank : card.rank.charAt(0);
    return `${r}${SUIT_SYMBOLS[card.suit]}`;
  }
  return `${card.number}`;
}
