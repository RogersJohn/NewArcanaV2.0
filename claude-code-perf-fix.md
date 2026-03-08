# Claude Code Prompt: Optimize Wild Card Poker Evaluation

## Context

The New Arcana simulation engine runs at ~40 games/second with diverse AI. The bottleneck is `src/poker.js` — specifically the `evaluateWithWilds` function, which brute-forces all possible rank/suit assignments for wild cards.

Current performance per evaluation call:
- Normal hand (no wilds): ~4-8 µs
- 1 wild card: ~80-300 µs (56 combinations tried)
- 2 wild cards: ~7,600 µs (3,136 combinations tried)

`evaluateHand` is called dozens of times per game turn by AI personas (ScoringAI, OpportunistAI, BuilderAI, etc. all call it to evaluate potential realm states), so this adds up to ~25ms per game — making it the dominant cost.

The existing poker tests (44 tests in `test/poker.test.js`) are comprehensive and include property-based tests, a "wild never worsens a hand" invariant, and transitivity checks. These tests are the correctness oracle — the new implementation MUST pass all of them unchanged.

## The Fix

Replace the brute-force `evaluateWithWilds` with an analytical approach that determines the optimal wild card assignment directly from the normal cards, without trying all 56^N combinations.

### Key Insight

A wild card is "every suit and any value simultaneously, always producing the strongest possible poker hand" (from RULES.md). For any given set of normal cards, the optimal assignment for each wild is deterministic:

1. **Check if a straight flush is possible** (or achievable with the wilds). If so, assign wilds to complete it — this is the best possible hand.
2. **Check if N-of-a-kind can be maximized.** If you have 4 of a rank, a wild makes five-of-a-kind. If you have 3, a wild makes four-of-a-kind. If you have 2 of two different ranks, a wild should join whichever rank gives the better hand type (e.g., making trips rather than adding to a pair). With 2 wilds and a pair, that's four-of-a-kind.
3. **Check if a flush is possible.** If 4 cards share a suit and you have a wild, the wild completes the flush.
4. **Check if a straight is possible.** If 4 cards are within a range of 5 consecutive ranks with one gap, the wild fills the gap.
5. **Otherwise, maximize grouping** — the wild becomes a copy of the most-repeated rank.

### Implementation Plan

Replace ONLY the `evaluateWithWilds` function and its helper `generateWildAssignments`. Keep `evaluateNormalHand`, `compareHands`, `checkStraight`, `highCardOfStraight`, and the `evaluateHand` entry point exactly as they are.

Create a new function `evaluateWithWildsAnalytical(normals, numWilds)` that returns the same result format as the current `evaluateWithWilds`.

#### Algorithm for 1 wild:

```
Given: N normal cards + 1 wild

1. Analyze normal cards:
   - rankCounts: map of rank -> count
   - suitCounts: map of suit -> count  
   - maxRankCount: highest count of any rank
   - dominantSuit: suit with the most cards
   - dominantSuitCount: count of that suit

2. Try to build the best hand (check in order, return first match):

   a) STRAIGHT FLUSH check:
      - For each suit, collect the ranks present
      - Check if adding 1 rank could complete a 5-card sequence in that suit
      - If yes AND total cards would be 5: wild = missing rank in that suit → straight flush
   
   b) FIVE-OF-A-KIND: if maxRankCount >= 4 and N+1 >= 5:
      - Wild = same rank → five-of-a-kind
   
   c) FOUR-OF-A-KIND: if maxRankCount >= 3:
      - Wild = same rank as the trips → four-of-a-kind
   
   d) FULL HOUSE from two pair: if we have exactly 2 pairs (two ranks with count 2) and N+1 >= 5:
      - Wild = rank of the higher pair → full house (trips + pair)
   
   e) FLUSH check: if dominantSuitCount >= 4 and N+1 >= 5:
      - Wild = highest rank not present in that suit, same suit → flush
      - BUT also check: could the wild fill a straight flush gap? If so, prefer that.
   
   f) STRAIGHT check: if N+1 >= 5:
      - Get unique ranks, check if any window of 5 consecutive ranks has exactly 4 present
      - Wild = the missing rank, any suit → straight
   
   g) THREE-OF-A-KIND: if maxRankCount >= 2:
      - Wild = same rank as the pair → trips
   
   h) PAIR: 
      - Wild = same rank as the highest existing card → pair

   After assigning the wild, call evaluateNormalHand on the combined set.

3. For robustness: if the above logic is tricky to get right for all edge cases, 
   use a hybrid approach — try only the PROMISING assignments (not all 56):
   - Same rank as each existing rank (max ~5 options)
   - Same suit as dominant suit, at each rank that helps (for flush/straight-flush)
   - Ranks that fill straight gaps
   This reduces from 56 to ~10-15 evaluations maximum.
```

#### Algorithm for 2+ wilds:

The fully analytical approach for 2+ wilds is more complex. Use the **hybrid pruned approach**:

1. Generate a set of *candidate* assignments (not all 56^N):
   - For each wild, only consider:
     - Matching each existing rank (duplication → n-of-a-kind)
     - Matching the dominant suit at the highest possible rank (flush)
     - Filling straight gaps in any suit present (straight/straight flush)
   - This produces ~10-20 candidates per wild instead of 56
   
2. For 2 wilds, that's ~200-400 combinations instead of 3,136
3. For each combination, call `evaluateNormalHand` and track the best

This hybrid approach is safe because:
- The optimal wild assignment will always either match an existing rank, complete a suit-based hand, or fill a straight gap. There is no scenario where the optimal play is a rank/suit combination that has no relationship to the existing cards.

### Implementation Requirements

1. **Create the new function in `src/poker.js`** — replace `evaluateWithWilds` in-place. Remove `generateWildAssignments` entirely.

2. **Do NOT change `evaluateNormalHand`, `compareHands`, `checkStraight`, `highCardOfStraight`, or the `evaluateHand` signature.** The only change to `evaluateHand` is that it now calls the new function instead of the old one.

3. **All 44 existing poker tests must pass unchanged.** Do not modify any test. The tests are the correctness specification.

4. **Add a performance benchmark test** in `test/poker.test.js`:

```javascript
describe('Performance', () => {
  it('1-wild evaluation is under 50µs average', () => {
    const hand = [
      mc('CUPS', 5), mc('WANDS', 8), mc('SWORDS', 3), mc('COINS', 10), wild(17)
    ];
    const t0 = performance.now();
    const N = 1000;
    for (let i = 0; i < N; i++) evaluateHand(hand);
    const avgUs = (performance.now() - t0) / N * 1000;
    expect(avgUs).toBeLessThan(50);
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
```

5. **Add a correctness cross-check test** that verifies the new implementation matches the old one on a large random sample:

```javascript
it('analytical evaluator matches brute-force on 2000 random hands with wilds', () => {
  const rng = createRNG(54321);
  let mismatches = 0;
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
    const result = evaluateHand(hand);
    // Verify the result is valid
    expect(result.rank).toBeGreaterThanOrEqual(0);
    expect(result.rank).toBeLessThanOrEqual(9);
  }
});
```

**To make the cross-check actually work:** Before deleting the old `evaluateWithWilds`, copy it into the test file as `bruteForceEvaluateWithWilds` (a local function). Then the test can compare:

```javascript
it('analytical evaluator matches brute-force on 2000 random hands with wilds', () => {
  const rng = createRNG(54321);
  for (let i = 0; i < 2000; i++) {
    const hand = [];
    const numNormal = rng.nextInt(4) + 1;
    const numWild = rng.nextInt(2) + 1;
    for (let j = 0; j < numNormal; j++) {
      hand.push(mc(SUITS[rng.nextInt(4)], RANKS[rng.nextInt(14)]));
    }
    for (let j = 0; j < numWild; j++) {
      hand.push(wild(17 + j));
    }
    
    const normals = hand.filter(c => c.type === 'minor');
    const wilds = hand.filter(c => c.type === 'major');
    
    const analytical = evaluateHand(hand);
    const bruteForce = bruteForceEvaluateWithWilds(normals, wilds.length);
    
    expect(analytical.rank).toBe(bruteForce.rank);
    if (analytical.rank === bruteForce.rank) {
      expect(compareHands(analytical, bruteForce)).toBe(0);
    }
  }
});
```

6. **Run a simulation-level benchmark** after the fix:

```bash
node --input-type=module -e "
import { runSimulation } from './src/simulation.js';
const t0 = Date.now();
const sim = runSimulation({ games: 1000, players: 4, seed: 1 });
const elapsed = (Date.now() - t0) / 1000;
console.log('1000 games in ' + elapsed.toFixed(1) + 's (' + Math.round(1000/elapsed) + ' games/sec)');
console.log('Errors:', sim.errors);
"
```

The target is at least 100 games/second (2.5x improvement). If using the pure analytical approach for 1-wild and pruned hybrid for 2-wild, expect 150-300 games/sec.

7. **Verify deterministic reproducibility is maintained:**

```bash
npx vitest run test/effect-resolver.test.js -t "same seed produces identical"
```

This existing test must still pass — the optimization must not change game outcomes.

## Commit

Single commit: `perf: replace brute-force wild card evaluation with analytical approach`

## What NOT to Do

- Do NOT add caching/memoization. The card objects have unique IDs so memoization by object reference won't help, and building cache keys from card properties adds overhead for a function that's already fast for non-wild hands.
- Do NOT change the `evaluateHand` function signature or return format.
- Do NOT modify any AI code. The AIs call `evaluateHand` and expect the same interface.
- Do NOT change `evaluateNormalHand`. It's already fast and correct.
- Do NOT weaken any existing test. All 200 tests must pass.
