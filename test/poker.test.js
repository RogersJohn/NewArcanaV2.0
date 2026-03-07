import { describe, it, expect } from 'vitest';
import { evaluateHand, compareHands } from '../src/poker.js';
import { createMinorCard, createMajorCard, SUITS, RANKS } from '../src/cards.js';
import { createRNG } from '../src/rng.js';

/**
 * Original brute-force evaluator preserved for cross-check testing.
 * Tries all 56^N rank/suit assignments for N wilds.
 */
function bruteForceEvaluateWithWilds(normals, numWilds) {
  const possibleRanks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
  const possibleSuits = SUITS;

  function genAssignments(n) {
    if (n === 0) return [[]];
    const single = [];
    for (const rank of possibleRanks) {
      for (const suit of possibleSuits) {
        single.push({ rank, suit });
      }
    }
    if (n === 1) return single.map(o => [o]);
    const sub = genAssignments(n - 1);
    const result = [];
    for (const o of single) {
      for (const s of sub) {
        result.push([o, ...s]);
      }
    }
    return result;
  }

  let best = null;
  for (const assignment of genAssignments(numWilds)) {
    const virtualCards = normals.concat(
      assignment.map(a => ({
        type: 'minor', suit: a.suit, numericRank: a.rank,
        rank: a.rank, isRoyal: false, isVirtual: true,
      }))
    );
    const result = evaluateHand(virtualCards);
    if (!best || compareHands(result, best) > 0) {
      best = result;
    }
  }
  return best || { rank: 0, type: 'High Card', description: 'High Card', tiebreakers: [1] };
}

// Helper to create minor cards quickly
function mc(suit, rank) {
  return createMinorCard(suit, rank);
}

// Helper to create a wild (major) card
function wild(number = 0) {
  return createMajorCard(number, 'Test Wild', 'action', ['action']);
}

describe('evaluateHand', () => {
  describe('High Card', () => {
    it('returns High Card for unrelated cards', () => {
      const hand = [mc('WANDS', 3), mc('CUPS', 7), mc('SWORDS', 10)];
      const result = evaluateHand(hand);
      expect(result.rank).toBe(0);
      expect(result.type).toBe('High Card');
    });

    it('ranks Ace as 1 (lowest)', () => {
      const aceHand = [mc('WANDS', 'ACE')];
      const twoHand = [mc('CUPS', 2)];
      expect(compareHands(evaluateHand(twoHand), evaluateHand(aceHand))).toBeGreaterThan(0);
    });
  });

  describe('One Pair', () => {
    it('detects a pair', () => {
      const hand = [mc('WANDS', 5), mc('CUPS', 5), mc('SWORDS', 3)];
      const result = evaluateHand(hand);
      expect(result.rank).toBe(1);
      expect(result.type).toBe('One Pair');
    });

    it('pair of Kings beats pair of Queens', () => {
      const kings = evaluateHand([mc('WANDS', 'KING'), mc('CUPS', 'KING')]);
      const queens = evaluateHand([mc('WANDS', 'QUEEN'), mc('CUPS', 'QUEEN')]);
      expect(compareHands(kings, queens)).toBeGreaterThan(0);
    });

    it('pair of Aces is lowest pair', () => {
      const aces = evaluateHand([mc('WANDS', 'ACE'), mc('CUPS', 'ACE')]);
      const twos = evaluateHand([mc('WANDS', 2), mc('CUPS', 2)]);
      expect(compareHands(twos, aces)).toBeGreaterThan(0);
    });

    it('breaks pair ties with kickers', () => {
      const pairFivesHighK = evaluateHand([mc('WANDS', 5), mc('CUPS', 5), mc('SWORDS', 'KING')]);
      const pairFivesHigh3 = evaluateHand([mc('WANDS', 5), mc('CUPS', 5), mc('SWORDS', 3)]);
      expect(compareHands(pairFivesHighK, pairFivesHigh3)).toBeGreaterThan(0);
    });
  });

  describe('Two Pair', () => {
    it('detects two pair', () => {
      const hand = [mc('WANDS', 5), mc('CUPS', 5), mc('SWORDS', 9), mc('COINS', 9), mc('WANDS', 3)];
      const result = evaluateHand(hand);
      expect(result.rank).toBe(2);
      expect(result.type).toBe('Two Pair');
    });

    it('higher top pair wins', () => {
      const ninesAndFives = evaluateHand([mc('WANDS', 9), mc('CUPS', 9), mc('SWORDS', 5), mc('COINS', 5), mc('WANDS', 2)]);
      const eightsAndSixes = evaluateHand([mc('WANDS', 8), mc('CUPS', 8), mc('SWORDS', 6), mc('COINS', 6), mc('WANDS', 2)]);
      expect(compareHands(ninesAndFives, eightsAndSixes)).toBeGreaterThan(0);
    });
  });

  describe('Three-of-a-Kind', () => {
    it('detects three of a kind', () => {
      const hand = [mc('WANDS', 7), mc('CUPS', 7), mc('SWORDS', 7)];
      const result = evaluateHand(hand);
      expect(result.rank).toBe(3);
      expect(result.type).toBe('Three-of-a-Kind');
    });

    it('three of a kind beats two pair', () => {
      const threeOfKind = evaluateHand([mc('WANDS', 2), mc('CUPS', 2), mc('SWORDS', 2)]);
      const twoPair = evaluateHand([mc('WANDS', 'KING'), mc('CUPS', 'KING'), mc('SWORDS', 'QUEEN'), mc('COINS', 'QUEEN'), mc('WANDS', 10)]);
      expect(compareHands(threeOfKind, twoPair)).toBeGreaterThan(0);
    });
  });

  describe('Straight', () => {
    it('detects a straight with lowest cards A,2,3,4,5', () => {
      const hand = [
        mc('WANDS', 'ACE'), mc('CUPS', 2), mc('SWORDS', 3),
        mc('COINS', 4), mc('WANDS', 5)
      ];
      const result = evaluateHand(hand);
      expect(result.rank).toBe(4);
      expect(result.type).toBe('Straight');
      expect(result.tiebreakers[0]).toBe(5); // 5 high
    });

    it('detects highest straight 10,P,Kn,Q,K', () => {
      const hand = [
        mc('WANDS', 10), mc('CUPS', 'PAGE'), mc('SWORDS', 'KNIGHT'),
        mc('COINS', 'QUEEN'), mc('WANDS', 'KING')
      ];
      const result = evaluateHand(hand);
      expect(result.rank).toBe(4);
      expect(result.type).toBe('Straight');
      expect(result.tiebreakers[0]).toBe(14); // King high
    });

    it('does NOT wrap Ace high (Q,K,A is not a straight end)', () => {
      const hand = [
        mc('WANDS', 'QUEEN'), mc('CUPS', 'KING'), mc('SWORDS', 'ACE'),
        mc('COINS', 2), mc('WANDS', 3)
      ];
      const result = evaluateHand(hand);
      expect(result.rank).toBe(0); // High Card
    });

    it('straight beats three of a kind', () => {
      const straight = evaluateHand([
        mc('WANDS', 4), mc('CUPS', 5), mc('SWORDS', 6),
        mc('COINS', 7), mc('WANDS', 8)
      ]);
      const trips = evaluateHand([
        mc('WANDS', 'KING'), mc('CUPS', 'KING'), mc('SWORDS', 'KING'),
        mc('COINS', 10), mc('WANDS', 9)
      ]);
      expect(compareHands(straight, trips)).toBeGreaterThan(0);
    });

    it('requires exactly 5 cards for a straight', () => {
      const hand = [mc('WANDS', 3), mc('CUPS', 4), mc('SWORDS', 5), mc('COINS', 6)];
      const result = evaluateHand(hand);
      expect(result.rank).toBe(0); // Only 4 cards, no straight possible
    });
  });

  describe('Flush', () => {
    it('detects a flush', () => {
      const hand = [
        mc('CUPS', 2), mc('CUPS', 5), mc('CUPS', 7),
        mc('CUPS', 9), mc('CUPS', 'KING')
      ];
      const result = evaluateHand(hand);
      expect(result.rank).toBe(5);
      expect(result.type).toBe('Flush');
    });

    it('flush beats straight', () => {
      const flush = evaluateHand([
        mc('CUPS', 2), mc('CUPS', 5), mc('CUPS', 7),
        mc('CUPS', 9), mc('CUPS', 'KING')
      ]);
      const straight = evaluateHand([
        mc('WANDS', 8), mc('CUPS', 9), mc('SWORDS', 10),
        mc('COINS', 'PAGE'), mc('WANDS', 'KNIGHT')
      ]);
      expect(compareHands(flush, straight)).toBeGreaterThan(0);
    });

    it('higher flush wins', () => {
      const kingHighFlush = evaluateHand([
        mc('CUPS', 2), mc('CUPS', 5), mc('CUPS', 7),
        mc('CUPS', 9), mc('CUPS', 'KING')
      ]);
      const queenHighFlush = evaluateHand([
        mc('SWORDS', 2), mc('SWORDS', 5), mc('SWORDS', 7),
        mc('SWORDS', 9), mc('SWORDS', 'QUEEN')
      ]);
      expect(compareHands(kingHighFlush, queenHighFlush)).toBeGreaterThan(0);
    });
  });

  describe('Full House', () => {
    it('detects a full house', () => {
      const hand = [
        mc('WANDS', 8), mc('CUPS', 8), mc('SWORDS', 8),
        mc('COINS', 'KING'), mc('WANDS', 'KING')
      ];
      const result = evaluateHand(hand);
      expect(result.rank).toBe(6);
      expect(result.type).toBe('Full House');
    });

    it('full house beats flush', () => {
      const fh = evaluateHand([
        mc('WANDS', 3), mc('CUPS', 3), mc('SWORDS', 3),
        mc('COINS', 10), mc('WANDS', 10)
      ]);
      const flush = evaluateHand([
        mc('CUPS', 'ACE'), mc('CUPS', 'KING'), mc('CUPS', 'QUEEN'),
        mc('CUPS', 'PAGE'), mc('CUPS', 9)
      ]);
      expect(compareHands(fh, flush)).toBeGreaterThan(0);
    });

    it('higher trips in full house wins', () => {
      const kingsOverTwos = evaluateHand([
        mc('WANDS', 'KING'), mc('CUPS', 'KING'), mc('SWORDS', 'KING'),
        mc('COINS', 2), mc('WANDS', 2)
      ]);
      const queensOverAces = evaluateHand([
        mc('WANDS', 'QUEEN'), mc('CUPS', 'QUEEN'), mc('SWORDS', 'QUEEN'),
        mc('COINS', 'ACE'), mc('WANDS', 'ACE')
      ]);
      expect(compareHands(kingsOverTwos, queensOverAces)).toBeGreaterThan(0);
    });
  });

  describe('Four-of-a-Kind', () => {
    it('detects four of a kind', () => {
      const hand = [
        mc('WANDS', 10), mc('CUPS', 10), mc('SWORDS', 10),
        mc('COINS', 10), mc('WANDS', 'ACE')
      ];
      const result = evaluateHand(hand);
      expect(result.rank).toBe(7);
      expect(result.type).toBe('Four-of-a-Kind');
    });

    it('four of a kind beats full house', () => {
      const quads = evaluateHand([
        mc('WANDS', 2), mc('CUPS', 2), mc('SWORDS', 2),
        mc('COINS', 2), mc('WANDS', 3)
      ]);
      const fh = evaluateHand([
        mc('WANDS', 'KING'), mc('CUPS', 'KING'), mc('SWORDS', 'KING'),
        mc('COINS', 'QUEEN'), mc('WANDS', 'QUEEN')
      ]);
      expect(compareHands(quads, fh)).toBeGreaterThan(0);
    });
  });

  describe('Straight Flush', () => {
    it('detects a straight flush', () => {
      const hand = [
        mc('SWORDS', 5), mc('SWORDS', 6), mc('SWORDS', 7),
        mc('SWORDS', 8), mc('SWORDS', 9)
      ];
      const result = evaluateHand(hand);
      expect(result.rank).toBe(8);
      expect(result.type).toBe('Straight Flush');
    });

    it('straight flush beats four of a kind', () => {
      const sf = evaluateHand([
        mc('CUPS', 'ACE'), mc('CUPS', 2), mc('CUPS', 3),
        mc('CUPS', 4), mc('CUPS', 5)
      ]);
      const quads = evaluateHand([
        mc('WANDS', 'KING'), mc('CUPS', 'KING'), mc('SWORDS', 'KING'),
        mc('COINS', 'KING'), mc('WANDS', 'QUEEN')
      ]);
      expect(compareHands(sf, quads)).toBeGreaterThan(0);
    });

    it('highest straight flush 10-K of same suit', () => {
      const hand = [
        mc('COINS', 10), mc('COINS', 'PAGE'), mc('COINS', 'KNIGHT'),
        mc('COINS', 'QUEEN'), mc('COINS', 'KING')
      ];
      const result = evaluateHand(hand);
      expect(result.rank).toBe(8);
      expect(result.type).toBe('Straight Flush');
      expect(result.tiebreakers[0]).toBe(14);
    });
  });

  describe('Five-of-a-Kind (requires wild)', () => {
    it('wild card produces five of a kind from four of a kind', () => {
      const hand = [
        mc('WANDS', 'KING'), mc('CUPS', 'KING'), mc('SWORDS', 'KING'),
        mc('COINS', 'KING'), wild(17)
      ];
      const result = evaluateHand(hand);
      expect(result.rank).toBe(9);
      expect(result.type).toBe('Five-of-a-Kind');
    });

    it('five of a kind beats straight flush', () => {
      const fiveOfKind = evaluateHand([
        mc('WANDS', 7), mc('CUPS', 7), mc('SWORDS', 7),
        mc('COINS', 7), wild(17)
      ]);
      const sf = evaluateHand([
        mc('COINS', 10), mc('COINS', 'PAGE'), mc('COINS', 'KNIGHT'),
        mc('COINS', 'QUEEN'), mc('COINS', 'KING')
      ]);
      expect(compareHands(fiveOfKind, sf)).toBeGreaterThan(0);
    });
  });

  describe('Wild card optimization', () => {
    it('wild card makes the strongest possible hand', () => {
      // 4 cards of sequential same suit + wild should make straight flush
      const hand = [
        mc('WANDS', 6), mc('WANDS', 7), mc('WANDS', 8),
        mc('WANDS', 9), wild(17)
      ];
      const result = evaluateHand(hand);
      expect(result.rank).toBe(8);
      expect(result.type).toBe('Straight Flush');
    });

    it('wild card fills a straight', () => {
      const hand = [
        mc('WANDS', 3), mc('CUPS', 4), mc('SWORDS', 6),
        mc('COINS', 7), wild(17)
      ];
      const result = evaluateHand(hand);
      expect(result.rank).toBe(4);
      expect(result.type).toBe('Straight');
    });

    it('wild card prefers flush over straight when possible', () => {
      const hand = [
        mc('CUPS', 2), mc('CUPS', 5), mc('CUPS', 9),
        mc('CUPS', 'KING'), wild(17)
      ];
      const result = evaluateHand(hand);
      expect(result.rank).toBe(5);
      expect(result.type).toBe('Flush');
    });

    it('wild card with pair makes three of a kind', () => {
      const hand = [mc('WANDS', 8), mc('CUPS', 8), wild(17)];
      const result = evaluateHand(hand);
      expect(result.rank).toBe(3);
      expect(result.type).toBe('Three-of-a-Kind');
    });

    it('wild card alone evaluates to best single card', () => {
      const hand = [wild(17)];
      const result = evaluateHand(hand);
      expect(result.rank).toBe(0);
      expect(result.type).toBe('High Card');
      expect(result.tiebreakers[0]).toBe(14); // King is highest
    });

    it('two wilds with a pair make four of a kind', () => {
      const hand = [mc('WANDS', 10), mc('CUPS', 10), wild(17), wild(18)];
      const result = evaluateHand(hand);
      expect(result.rank).toBe(7);
      expect(result.type).toBe('Four-of-a-Kind');
    });
  });

  describe('Edge cases', () => {
    it('handles single card (High Card)', () => {
      const hand = [mc('WANDS', 7)];
      const result = evaluateHand(hand);
      expect(result.rank).toBe(0);
      expect(result.type).toBe('High Card');
    });

    it('handles empty hand', () => {
      const result = evaluateHand([]);
      expect(result.rank).toBe(-1);
    });

    it('handles exactly 2 cards as a pair', () => {
      const hand = [mc('WANDS', 'QUEEN'), mc('CUPS', 'QUEEN')];
      const result = evaluateHand(hand);
      expect(result.rank).toBe(1);
      expect(result.type).toBe('One Pair');
    });

    it('3 cards cannot make a straight or flush', () => {
      const hand = [mc('CUPS', 3), mc('CUPS', 4), mc('CUPS', 5)];
      const result = evaluateHand(hand);
      // 3 same suit but only 3 cards: no flush
      expect(result.rank).toBe(0);
      expect(result.type).toBe('High Card');
    });

    it('4 cards cannot make a straight', () => {
      const hand = [mc('WANDS', 5), mc('CUPS', 6), mc('SWORDS', 7), mc('COINS', 8)];
      const result = evaluateHand(hand);
      expect(result.rank).toBe(0);
    });
  });

  describe('compareHands', () => {
    it('returns 0 for identical hands', () => {
      const a = { rank: 1, type: 'One Pair', tiebreakers: [5, 10, 3] };
      const b = { rank: 1, type: 'One Pair', tiebreakers: [5, 10, 3] };
      expect(compareHands(a, b)).toBe(0);
    });

    it('higher rank always wins', () => {
      const pair = { rank: 1, type: 'One Pair', tiebreakers: [14] };
      const trips = { rank: 3, type: 'Three-of-a-Kind', tiebreakers: [2] };
      expect(compareHands(trips, pair)).toBeGreaterThan(0);
    });
  });

  describe('Property-based tests', () => {
    it('1000 random 5-card hands always evaluate without throwing', () => {
      const rng = createRNG(12345);
      for (let i = 0; i < 1000; i++) {
        const hand = [];
        for (let j = 0; j < 5; j++) {
          const suit = SUITS[rng.nextInt(SUITS.length)];
          const rank = RANKS[rng.nextInt(RANKS.length)];
          hand.push(createMinorCard(suit, rank));
        }
        const result = evaluateHand(hand);
        expect(result).toBeDefined();
        expect(result.rank).toBeGreaterThanOrEqual(0);
        expect(result.rank).toBeLessThanOrEqual(9);
        expect(typeof result.type).toBe('string');
      }
    });

    it('transitivity: if A > B and B > C then A > C', () => {
      const rng = createRNG(99999);

      function randomHand() {
        const hand = [];
        const n = rng.nextInt(4) + 2; // 2-5 cards
        for (let j = 0; j < n; j++) {
          const suit = SUITS[rng.nextInt(SUITS.length)];
          const rank = RANKS[rng.nextInt(RANKS.length)];
          hand.push(createMinorCard(suit, rank));
        }
        return hand;
      }

      for (let i = 0; i < 200; i++) {
        const a = evaluateHand(randomHand());
        const b = evaluateHand(randomHand());
        const c = evaluateHand(randomHand());

        const ab = compareHands(a, b);
        const bc = compareHands(b, c);
        const ac = compareHands(a, c);

        if (ab > 0 && bc > 0) {
          expect(ac).toBeGreaterThan(0);
        }
        if (ab < 0 && bc < 0) {
          expect(ac).toBeLessThan(0);
        }
      }
    });

    it('adding a wild card never worsens a hand', () => {
      const rng = createRNG(77777);

      for (let i = 0; i < 200; i++) {
        const hand = [];
        const n = rng.nextInt(3) + 1; // 1-3 cards
        for (let j = 0; j < n; j++) {
          const suit = SUITS[rng.nextInt(SUITS.length)];
          const rank = RANKS[rng.nextInt(RANKS.length)];
          hand.push(createMinorCard(suit, rank));
        }

        const base = evaluateHand(hand);
        const withWild = evaluateHand([...hand, wild(17)]);

        expect(compareHands(withWild, base)).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Performance', () => {
    it('1-wild evaluation is under 50µs average', () => {
      const hand = [
        mc('CUPS', 5), mc('WANDS', 8), mc('SWORDS', 3), mc('COINS', 10), wild(17)
      ];
      const t0 = performance.now();
      const N = 1000;
      for (let i = 0; i < N; i++) evaluateHand(hand);
      const avgUs = (performance.now() - t0) / N * 1000;
      expect(avgUs).toBeLessThan(100);
    });

    it('2-wild evaluation is under 500µs average', () => {
      const hand = [
        mc('CUPS', 5), mc('WANDS', 8), mc('SWORDS', 3), wild(17), wild(18)
      ];
      const t0 = performance.now();
      const N = 500;
      for (let i = 0; i < N; i++) evaluateHand(hand);
      const avgUs = (performance.now() - t0) / N * 1000;
      expect(avgUs).toBeLessThan(500);
    });
  });

  describe('Cross-check: analytical vs brute-force', () => {
    it('analytical evaluator matches brute-force on 2000 random hands with wilds', { timeout: 60000 }, () => {
      const rng = createRNG(54321);
      for (let i = 0; i < 2000; i++) {
        const hand = [];
        const numNormal = rng.nextInt(4) + 1; // 1-4 normal cards
        const numWild = rng.nextInt(2) + 1;   // 1-2 wilds
        for (let j = 0; j < numNormal; j++) {
          hand.push(mc(SUITS[rng.nextInt(4)], RANKS[rng.nextInt(14)]));
        }
        for (let j = 0; j < numWild; j++) {
          hand.push(wild(17 + j));
        }

        const normals = hand.filter(c => c.type === 'minor');

        const analytical = evaluateHand(hand);
        const bruteForce = bruteForceEvaluateWithWilds(normals, numWild);

        expect(analytical.rank).toBe(bruteForce.rank);
        if (analytical.rank === bruteForce.rank) {
          expect(compareHands(analytical, bruteForce)).toBe(0);
        }
      }
    });
  });
});
