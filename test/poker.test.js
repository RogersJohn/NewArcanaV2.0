import { describe, it, expect } from 'vitest';
import { evaluateHand, compareHands } from '../src/poker.js';
import { createMinorCard, createMajorCard } from '../src/cards.js';

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
});
