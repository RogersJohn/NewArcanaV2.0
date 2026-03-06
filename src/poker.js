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
 * Evaluate a hand with N wild cards using a pruned candidate approach.
 * Instead of trying all 56^N combinations, generates only promising
 * candidates (ranks that match existing cards, fill straights, or complete flushes).
 * @param {object[]} normals - Non-wild cards
 * @param {number} numWilds - Number of wild cards
 * @returns {object} Best hand evaluation
 */
function evaluateWithWilds(normals, numWilds) {
  const candidates = generateCandidates(normals);

  // For each wild, try each candidate; take cartesian product for multiple wilds
  let assignments = candidates.map(c => [c]);
  for (let w = 1; w < numWilds; w++) {
    const next = [];
    for (const prev of assignments) {
      for (const c of candidates) {
        next.push([...prev, c]);
      }
    }
    assignments = next;
  }

  let best = null;
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
 * Generate a pruned set of promising wild card assignments.
 * Key insight: for rank groupings (pair/trips/quads/five-of-a-kind),
 * only the rank matters — use a neutral suit. For flush/straight-flush,
 * try ranks in the dominant suit. For straights, fill gaps.
 * Typical output: 8-15 candidates instead of 56.
 */
function generateCandidates(normals) {
  const seen = new Set();
  const result = [];

  function add(rank, suit) {
    const key = rank * 5 + SUIT_IDX[suit];
    if (seen.has(key)) return;
    seen.add(key);
    result.push({ rank, suit });
  }

  if (normals.length === 0) {
    // With no normals, King is the best single card
    add(14, 'WANDS');
    return result;
  }

  // Analyze normals
  const rankCounts = {};
  const suitCounts = { WANDS: 0, CUPS: 0, SWORDS: 0, COINS: 0 };
  for (const c of normals) {
    rankCounts[c.numericRank] = (rankCounts[c.numericRank] || 0) + 1;
    suitCounts[c.suit]++;
  }

  // Find dominant suit (most cards) and a neutral suit (fewest cards, for grouping)
  let domSuit = 'WANDS', domCount = 0, neutSuit = 'WANDS', neutCount = Infinity;
  for (const s of SUITS) {
    if (suitCounts[s] > domCount) { domCount = suitCounts[s]; domSuit = s; }
    if (suitCounts[s] < neutCount) { neutCount = suitCounts[s]; neutSuit = s; }
  }

  const presentRanks = Object.keys(rankCounts).map(Number);

  // 1. Grouping candidates: match each existing rank in neutral suit
  //    (suit doesn't affect rank grouping evaluation)
  for (const r of presentRanks) {
    add(r, neutSuit);
  }

  // 2. High card: King in neutral suit
  add(14, neutSuit);

  // 3. Straight gap fills
  const uniqueSet = new Set(presentRanks);
  for (let low = 1; low <= 10; low++) {
    let present = 0;
    for (let r = low; r <= low + 4; r++) {
      if (uniqueSet.has(r)) present++;
    }
    if (present >= 3) {
      for (let r = low; r <= low + 4; r++) {
        if (!uniqueSet.has(r)) {
          add(r, neutSuit);
        }
      }
    }
  }

  // 4. Flush candidates: if dominant suit has >= 2 cards, try key ranks in that suit
  if (domCount >= 2) {
    // For straight-flush: fill gaps in windows using only dominant suit ranks
    const domRankSet = new Set();
    for (const c of normals) {
      if (c.suit === domSuit) domRankSet.add(c.numericRank);
    }
    for (let low = 1; low <= 10; low++) {
      let present = 0;
      for (let r = low; r <= low + 4; r++) {
        if (domRankSet.has(r)) present++;
      }
      if (present >= 2) {
        for (let r = low; r <= low + 4; r++) {
          if (!domRankSet.has(r)) add(r, domSuit);
        }
      }
    }
    // For plain flush: add top ranks in dominant suit
    add(14, domSuit);
    add(13, domSuit);
    add(12, domSuit);
    // Also add existing ranks in dominant suit (for grouping + flush combo)
    for (const r of presentRanks) {
      add(r, domSuit);
    }
  }

  return result;
}

const SUIT_IDX = { WANDS: 0, CUPS: 1, SWORDS: 2, COINS: 3 };

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
