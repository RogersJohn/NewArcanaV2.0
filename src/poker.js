/**
 * Poker hand evaluation engine for New Arcana.
 *
 * Hand rankings (strongest to weakest):
 * 9: Five-of-a-Kind (requires wild)
 * 8: Straight Flush
 * 7: Four-of-a-Kind
 * 6: Full House
 * 5: Flush
 * 4: Straight
 * 3: Three-of-a-Kind
 * 2: Two Pair
 * 1: One Pair
 * 0: High Card
 *
 * Ace = rank 1 (lowest). Lowest straight: A,2,3,4,5. Highest: 10,P,Kn,Q,K.
 */

import { SUITS, RANK_VALUES } from './cards.js';

const HAND_TYPES = [
  'High Card', 'One Pair', 'Two Pair', 'Three-of-a-Kind',
  'Straight', 'Flush', 'Full House', 'Four-of-a-Kind',
  'Straight Flush', 'Five-of-a-Kind'
];

/**
 * Evaluate a poker hand, handling wild cards optimally.
 * Wild cards (type === 'major' in the realm) try all possible suit+rank combos
 * and return the strongest result.
 *
 * @param {object[]} cards - Array of cards (minor and/or major wilds)
 * @returns {{rank: number, type: string, description: string, tiebreakers: number[]}}
 */
export function evaluateHand(cards) {
  if (!cards || cards.length === 0) {
    return { rank: -1, type: 'Empty', description: 'No cards', tiebreakers: [] };
  }

  const wilds = cards.filter(c => c.type === 'major');
  const normals = cards.filter(c => c.type === 'minor');

  if (wilds.length === 0) {
    return evaluateNormalHand(normals);
  }

  // With wild cards, try all possible assignments and pick the best
  return evaluateWithWilds(normals, wilds.length);
}

/**
 * Evaluate a hand with N wild cards by trying all possible assignments.
 * @param {object[]} normals - Non-wild cards
 * @param {number} numWilds - Number of wild cards
 * @returns {object} Best hand evaluation
 */
function evaluateWithWilds(normals, numWilds) {
  // Generate all possible rank/suit assignments for wilds
  // Optimization: only try ranks 1-14 and all 4 suits
  const possibleRanks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
  const possibleSuits = SUITS;

  let best = null;

  // For single wild, brute force all 56 possibilities
  // For multiple wilds, still manageable (56^2 = 3136 for 2 wilds)
  const assignments = generateWildAssignments(numWilds, possibleRanks, possibleSuits);

  for (const assignment of assignments) {
    const virtualCards = normals.concat(
      assignment.map(a => ({
        type: 'minor',
        suit: a.suit,
        numericRank: a.rank,
        rank: a.rank,
        isRoyal: false,
        isVirtual: true,
      }))
    );
    const result = evaluateNormalHand(virtualCards);
    if (!best || compareHands(result, best) > 0) {
      best = result;
    }
  }

  return best || { rank: 0, type: 'High Card', description: 'High Card', tiebreakers: [1] };
}

/**
 * Generate all possible wild card assignments.
 */
function generateWildAssignments(numWilds, ranks, suits) {
  if (numWilds === 0) return [[]];

  const singleOptions = [];
  for (const rank of ranks) {
    for (const suit of suits) {
      singleOptions.push({ rank, suit });
    }
  }

  if (numWilds === 1) {
    return singleOptions.map(o => [o]);
  }

  // Recursive for multiple wilds
  const subAssignments = generateWildAssignments(numWilds - 1, ranks, suits);
  const result = [];
  for (const option of singleOptions) {
    for (const sub of subAssignments) {
      result.push([option, ...sub]);
    }
  }
  return result;
}

/**
 * Evaluate a hand with no wild cards.
 * @param {object[]} cards - Array of minor cards
 * @returns {object} Hand evaluation
 */
function evaluateNormalHand(cards) {
  const n = cards.length;
  if (n === 0) {
    return { rank: -1, type: 'Empty', description: 'No cards', tiebreakers: [] };
  }

  const ranks = cards.map(c => c.numericRank).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);

  // Count rank occurrences
  const rankCounts = {};
  for (const r of ranks) {
    rankCounts[r] = (rankCounts[r] || 0) + 1;
  }

  // Count suit occurrences
  const suitCounts = {};
  for (const s of suits) {
    suitCounts[s] = (suitCounts[s] || 0) + 1;
  }

  // Determine groups sorted by count then rank
  const groups = Object.entries(rankCounts)
    .map(([r, c]) => ({ rank: Number(r), count: c }))
    .sort((a, b) => b.count - a.count || b.rank - a.rank);

  const isFlush = n >= 5 && Object.keys(suitCounts).length === 1;
  const isStraight = n >= 5 && checkStraight(ranks);

  // Five-of-a-Kind
  if (groups[0]?.count >= 5) {
    return {
      rank: 9, type: 'Five-of-a-Kind',
      description: `Five-of-a-Kind, ${groups[0].rank}s`,
      tiebreakers: [groups[0].rank]
    };
  }

  // Straight Flush
  if (isStraight && isFlush) {
    return {
      rank: 8, type: 'Straight Flush',
      description: `Straight Flush, ${highCardOfStraight(ranks)} high`,
      tiebreakers: [highCardOfStraight(ranks)]
    };
  }

  // Four-of-a-Kind
  if (groups[0]?.count === 4) {
    const kickers = ranks.filter(r => r !== groups[0].rank).sort((a, b) => b - a);
    return {
      rank: 7, type: 'Four-of-a-Kind',
      description: `Four-of-a-Kind, ${groups[0].rank}s`,
      tiebreakers: [groups[0].rank, ...kickers]
    };
  }

  // Full House
  if (groups[0]?.count === 3 && groups[1]?.count >= 2) {
    return {
      rank: 6, type: 'Full House',
      description: `Full House, ${groups[0].rank}s full of ${groups[1].rank}s`,
      tiebreakers: [groups[0].rank, groups[1].rank]
    };
  }

  // Flush
  if (isFlush) {
    return {
      rank: 5, type: 'Flush',
      description: `Flush, ${ranks[0]} high`,
      tiebreakers: [...ranks]
    };
  }

  // Straight
  if (isStraight) {
    return {
      rank: 4, type: 'Straight',
      description: `Straight, ${highCardOfStraight(ranks)} high`,
      tiebreakers: [highCardOfStraight(ranks)]
    };
  }

  // Three-of-a-Kind
  if (groups[0]?.count === 3) {
    const kickers = ranks.filter(r => r !== groups[0].rank).sort((a, b) => b - a);
    return {
      rank: 3, type: 'Three-of-a-Kind',
      description: `Three-of-a-Kind, ${groups[0].rank}s`,
      tiebreakers: [groups[0].rank, ...kickers]
    };
  }

  // Two Pair
  if (groups[0]?.count === 2 && groups[1]?.count === 2) {
    const highPair = Math.max(groups[0].rank, groups[1].rank);
    const lowPair = Math.min(groups[0].rank, groups[1].rank);
    const kickers = ranks.filter(r => r !== highPair && r !== lowPair).sort((a, b) => b - a);
    return {
      rank: 2, type: 'Two Pair',
      description: `Two Pair, ${highPair}s and ${lowPair}s`,
      tiebreakers: [highPair, lowPair, ...kickers]
    };
  }

  // One Pair
  if (groups[0]?.count === 2) {
    const kickers = ranks.filter(r => r !== groups[0].rank).sort((a, b) => b - a);
    return {
      rank: 1, type: 'One Pair',
      description: `One Pair, ${groups[0].rank}s`,
      tiebreakers: [groups[0].rank, ...kickers]
    };
  }

  // High Card
  return {
    rank: 0, type: 'High Card',
    description: `High Card, ${ranks[0]}`,
    tiebreakers: [...ranks]
  };
}

/**
 * Check if sorted-descending ranks form a straight (5 consecutive).
 */
function checkStraight(ranks) {
  if (ranks.length < 5) return false;
  const unique = [...new Set(ranks)].sort((a, b) => b - a);
  if (unique.length < 5) return false;

  // Check for 5 consecutive descending
  for (let i = 0; i <= unique.length - 5; i++) {
    if (unique[i] - unique[i + 4] === 4) {
      return true;
    }
  }
  return false;
}

/**
 * Get the high card of a straight from sorted-descending ranks.
 */
function highCardOfStraight(ranks) {
  const unique = [...new Set(ranks)].sort((a, b) => b - a);
  for (let i = 0; i <= unique.length - 5; i++) {
    if (unique[i] - unique[i + 4] === 4) {
      return unique[i];
    }
  }
  return unique[0];
}

/**
 * Compare two hand evaluations. Returns positive if a > b, negative if a < b, 0 if equal.
 * @param {object} a - First hand evaluation
 * @param {object} b - Second hand evaluation
 * @returns {number}
 */
export function compareHands(a, b) {
  if (a.rank !== b.rank) return a.rank - b.rank;

  // Compare tiebreakers in order
  const len = Math.max(a.tiebreakers.length, b.tiebreakers.length);
  for (let i = 0; i < len; i++) {
    const aVal = a.tiebreakers[i] || 0;
    const bVal = b.tiebreakers[i] || 0;
    if (aVal !== bVal) return aVal - bVal;
  }
  return 0;
}
