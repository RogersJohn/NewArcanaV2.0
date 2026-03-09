/**
 * Card Tracker: Bayesian card counting for AI decision-making.
 *
 * Tracks all visible information (realms, tomes, pit, display, discard,
 * own hand) and infers probabilities about opponents' hidden hands.
 * The full minor deck is 56 cards (4 suits × 14 ranks).
 */

import { SUITS, RANKS, RANK_VALUES } from '../cards.js';

/**
 * Build a snapshot of all cards visible to a specific player.
 * "Visible" means: own hand, all realms, all tomes, all vaults,
 * display, minor discard pile, and major discard pile.
 * The pit is face-down and NOT visible (per rules).
 * The minor deck is NOT visible.
 * Other players' hands are NOT visible.
 *
 * @param {object} state - Game state
 * @param {number} playerIndex - The player whose perspective we're calculating from
 * @returns {object} Card tracker with probability methods
 */
export function createCardTracker(state, playerIndex) {
  const visible = new Set();    // Set of card IDs we can see
  const visibleMinor = [];       // Array of visible minor cards (for counting)
  const visibleMajor = [];       // Array of visible major cards

  // Own hand
  for (const card of state.players[playerIndex].hand) {
    visible.add(card.id);
    if (card.type === 'minor') visibleMinor.push(card);
    else visibleMajor.push(card);
  }

  // All realms (public information)
  for (const p of state.players) {
    for (const card of p.realm) {
      visible.add(card.id);
      if (card.type === 'minor') visibleMinor.push(card);
      else visibleMajor.push(card);
    }
  }

  // All tomes (public information)
  for (const p of state.players) {
    for (const card of p.tome) {
      visible.add(card.id);
      visibleMajor.push(card);
    }
  }

  // All vaults (public information — rank is known per rules)
  for (const p of state.players) {
    for (const card of p.vault) {
      visible.add(card.id);
      if (card.type === 'minor') visibleMinor.push(card);
      else visibleMajor.push(card);
    }
  }

  // Display (public)
  for (const card of state.display) {
    if (card) {
      visible.add(card.id);
      visibleMajor.push(card);
    }
  }

  // Minor discard pile (public — face up)
  for (const card of state.minorDiscard) {
    visible.add(card.id);
    visibleMinor.push(card);
  }

  // Major discard pile (public — face up)
  for (const card of state.majorDiscard) {
    visible.add(card.id);
    visibleMajor.push(card);
  }

  // NOTE: pit is face-down — we do NOT count those as visible.
  // NOTE: minor deck is face-down — not visible.
  // NOTE: major deck is face-down — not visible.
  // NOTE: other players' hands are hidden.

  // Count cards in the hidden pool
  // Total minor cards = 56, total major varies (22 for standard, 27 for extended)
  const totalMinor = 56;
  const visibleMinorCount = visibleMinor.length;

  // Count unseen minor cards by property
  const unseenAces = countFullDeck('ACE') - countVisible(visibleMinor, 'ACE');
  const unseenKings = countFullDeck('KING') - countVisible(visibleMinor, 'KING');
  const unseenQueens = countFullDeck('QUEEN') - countVisible(visibleMinor, 'QUEEN');
  const unseenKnights = countFullDeck('KNIGHT') - countVisible(visibleMinor, 'KNIGHT');
  const unseenPages = countFullDeck('PAGE') - countVisible(visibleMinor, 'PAGE');

  // Count unseen cards by suit
  const unseenBySuit = {};
  for (const suit of SUITS) {
    const fullCount = 14; // 14 cards per suit
    const visibleCount = visibleMinor.filter(c => c.suit === suit).length;
    unseenBySuit[suit] = fullCount - visibleCount;
  }

  // Count unseen cards by rank
  const unseenByRank = {};
  for (const rank of RANKS) {
    const numRank = RANK_VALUES[rank];
    const fullCount = 4; // 4 suits per rank
    const visibleCount = visibleMinor.filter(c => c.numericRank === numRank).length;
    unseenByRank[numRank] = fullCount - visibleCount;
  }

  // Total hidden cards held by OTHER players
  const otherPlayersCardCount = state.players
    .filter((_, i) => i !== playerIndex)
    .reduce((sum, p) => sum + p.hand.length, 0);

  // Hidden pool = other players' hands + minor deck + pit (all face-down)
  // Pit cards are gone for the round but we don't know which ones
  const pitCount = state.pit.length;
  const minorDeckCount = state.minorDeck.length;
  const hiddenPool = otherPlayersCardCount + minorDeckCount + pitCount;

  return {
    /**
     * Probability that a specific opponent holds at least one Ace.
     * Uses hypergeometric approximation: P(at least 1) = 1 - P(0).
     * @param {number} opponentIndex
     * @returns {number} Probability 0-1
     */
    probHasAce(opponentIndex) {
      const handSize = state.players[opponentIndex].hand.length;
      if (unseenAces <= 0 || handSize <= 0 || hiddenPool <= 0) return 0;
      return hypergeometricAtLeastOne(hiddenPool, unseenAces, handSize);
    },

    /**
     * Probability that a specific opponent holds at least one King.
     * @param {number} opponentIndex
     * @returns {number}
     */
    probHasKing(opponentIndex) {
      const handSize = state.players[opponentIndex].hand.length;
      if (unseenKings <= 0 || handSize <= 0 || hiddenPool <= 0) return 0;
      return hypergeometricAtLeastOne(hiddenPool, unseenKings, handSize);
    },

    /**
     * Probability that a specific opponent holds at least one Royal
     * (Page, Knight, or Queen) of a given suit.
     * @param {number} opponentIndex
     * @param {string} suit
     * @returns {number}
     */
    probHasRoyalOfSuit(opponentIndex, suit) {
      const handSize = state.players[opponentIndex].hand.length;
      // Count unseen royals of this suit
      const unseenRoyals = ['PAGE', 'KNIGHT', 'QUEEN'].reduce((sum, rank) => {
        const numRank = RANK_VALUES[rank];
        const fullPerSuit = 1; // 1 per suit
        const visibleOfThis = visibleMinor.filter(c => c.suit === suit && c.numericRank === numRank).length;
        return sum + (fullPerSuit - visibleOfThis);
      }, 0);
      if (unseenRoyals <= 0 || handSize <= 0 || hiddenPool <= 0) return 0;
      return hypergeometricAtLeastOne(hiddenPool, unseenRoyals, handSize);
    },

    /**
     * Probability that ANY opponent has an Ace (union over all opponents).
     * Approximate: 1 - product(1 - P(ace_i)) for each opponent i.
     * @param {number} excludePlayer - Player index to exclude (self)
     * @returns {number}
     */
    probAnyOpponentHasAce(excludePlayer) {
      let probNone = 1;
      for (let pi = 0; pi < state.players.length; pi++) {
        if (pi === excludePlayer) continue;
        probNone *= (1 - this.probHasAce(pi));
      }
      return 1 - probNone;
    },

    /**
     * Count of unseen Aces remaining.
     * @returns {number}
     */
    get unseenAces() { return unseenAces; },

    /**
     * Count of unseen Kings remaining.
     * @returns {number}
     */
    get unseenKings() { return unseenKings; },

    /**
     * Count of unseen cards of a given rank.
     * @param {number} numericRank
     * @returns {number}
     */
    unseenOfRank(numericRank) {
      return unseenByRank[numericRank] ?? 0;
    },

    /**
     * Count of unseen cards of a given suit.
     * @param {string} suit
     * @returns {number}
     */
    unseenOfSuit(suit) {
      return unseenBySuit[suit] ?? 0;
    },

    /** Total cards in hidden pool (opponent hands + deck + pit). */
    get hiddenPoolSize() { return hiddenPool; },

    /** Number of cards held by opponents (total). */
    get opponentCardCount() { return otherPlayersCardCount; },
  };
}

/**
 * Hypergeometric P(at least 1 success) when drawing `draw` cards
 * from a population of `N` containing `K` successes.
 * P(X >= 1) = 1 - P(X = 0) = 1 - C(K,0)*C(N-K,draw) / C(N,draw)
 * Simplified: 1 - product((N-K-i)/(N-i)) for i=0..draw-1
 */
function hypergeometricAtLeastOne(N, K, draw) {
  if (K <= 0 || draw <= 0 || N <= 0) return 0;
  if (K >= N) return 1;
  if (draw > N) return K > 0 ? 1 : 0;

  let probZero = 1;
  const nonSuccess = N - K;
  for (let i = 0; i < draw; i++) {
    if (N - i <= 0) break;
    probZero *= (nonSuccess - i) / (N - i);
    if (probZero <= 0) return 1;
  }
  return 1 - probZero;
}

/**
 * Count how many copies of a rank exist in the full 56-card minor deck.
 * @param {string} rank
 * @returns {number} Always 4 (one per suit)
 */
function countFullDeck(rank) {
  return 4; // 4 suits
}

/**
 * Count visible minor cards of a given rank.
 * @param {object[]} visibleMinor
 * @param {string} rank
 * @returns {number}
 */
function countVisible(visibleMinor, rank) {
  return visibleMinor.filter(c => c.rank === rank).length;
}
