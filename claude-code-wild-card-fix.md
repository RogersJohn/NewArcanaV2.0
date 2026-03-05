# Claude Code Prompt — Fix Wild Card Set Validation

## Context

Repo: https://github.com/RogersJohn/NewArcanaV2.0

Read the CLAUDE.md for full project context. This is a critical engine bug causing rounds to end far too quickly. AIs routinely play a wild card + 4 unrelated minor cards on their first turn, reaching 5 cards in realm immediately and ending the round after a single trip around the table. In real play, rounds typically last 4+ trips around the table.

## The Rule

From RULES.md, Wild Cards section:

> "When playing a wild Major Arcana card like this you announce the rank and suit you want assigned to the card **in order to identify the set you are playing** to your Realm."

> "Once in the Realm, the wild card can be thought of as being of every suit and any value all at once, and is assumed to be the card that would make the strongest possible poker combination."

There are **two distinct phases** for a wild card:

1. **At time of play**: The wild is declared as ONE specific rank and suit. The wild + any accompanying minors must form a **legal set** with that declared identity (pair, three-of-a-kind, four-of-a-kind, five-of-a-kind, straight, flush, or straight flush).

2. **Once in realm for scoring**: The wild becomes whatever makes the strongest hand from all cards currently in the realm.

The engine currently skips phase 1 entirely. `addWildActions` in `src/actions.js` generates wild + minor combinations based purely on scoring strength (phase 2), never checking whether a legal set exists at time of play. This means the engine allows wild + 4 completely unrelated cards (different ranks, different suits) as a legal action.

## The Bug

**File**: `src/actions.js`, `addWildActions()` (around line 444)

The current code generates all combinations of 1-4 minors from hand, evaluates them by poker hand strength, and offers the top 3. It never validates that the wild + minors form a legal set.

For example, it currently allows: `Wild + 7♣, 5♣, Page♦, 10♥` — three different suits, four different ranks. No possible declaration of the wild makes this a legal set (not a flush, not a straight, not N-of-a-kind).

## The Fix

Replace the `addWildActions` function with one that only generates combinations where the wild can be declared as a specific card that completes a legal set. The legal set types when playing are:

- **Wild alone**: Always legal (single card). Already handled.
- **Wild + 1 minor**: Wild declared as same rank → pair. Always legal.
- **Wild + 2 minors**: Legal if the 2 minors share the same rank (wild makes three-of-a-kind).
- **Wild + 3 minors**: Legal if the 3 minors share the same rank (wild makes four-of-a-kind). Also legal if wild can complete a 4-card straight or flush (but the rules only list straights and flushes as 5-card sets, so this would not be legal as a 4-card play — straights and flushes require exactly 5 cards).
- **Wild + 4 minors**: Legal only if:
  - All 4 minors share the same rank → five-of-a-kind
  - All 4 minors share the same suit → flush (wild declared as same suit, any rank not already present)
  - The 4 minors + wild can form a straight → the 4 minors have 4 distinct ranks that span at most 4 consecutive values with exactly one gap the wild can fill, OR the 4 minors are consecutive and the wild extends the run at either end
  - Combination of straight + flush → straight flush (same checks but also all same suit)

Here is the replacement function:

```js
/**
 * Add actions for playing a Major Arcana as wild card to Realm.
 * Wild + minors must form a legal set at time of play.
 * Legal sets: single, pair, three-of-a-kind, four-of-a-kind,
 * five-of-a-kind, straight (5 cards), flush (5 cards), straight flush (5 cards).
 */
function addWildActions(state, playerIndex, actions) {
  const player = state.players[playerIndex];
  // Can only play wild if no Major Arcana already in realm
  const hasWildInRealm = player.realm.some(c => c.type === 'major');
  if (hasWildInRealm) return;

  const majors = player.hand.filter(c => c.type === 'major');
  const minors = player.hand.filter(c => c.type === 'minor');

  for (const card of majors) {
    // Wild alone (single card) — always legal
    actions.push({
      type: 'PLAY_WILD',
      card,
      withCards: [],
      description: `Play ${cardName(card)} as wild card to Realm`,
    });

    if (minors.length === 0) continue;

    const validCombos = [];

    // Wild + 1 minor = pair (wild declared as same rank, different suit). Always legal.
    for (const m of minors) {
      validCombos.push({ combo: [m], desc: 'pair' });
    }

    // Wild + 2 minors = three-of-a-kind (all same rank)
    const byRank = groupBy(minors, c => c.numericRank);
    for (const [rank, cards] of Object.entries(byRank)) {
      if (cards.length >= 2) {
        const combos2 = combinations(cards, 2);
        for (const combo of combos2) {
          validCombos.push({ combo, desc: `three ${rank}s` });
        }
      }
    }

    // Wild + 3 minors = four-of-a-kind (all same rank)
    for (const [rank, cards] of Object.entries(byRank)) {
      if (cards.length >= 3) {
        const combos3 = combinations(cards, 3);
        for (const combo of combos3) {
          validCombos.push({ combo, desc: `four ${rank}s` });
        }
      }
    }

    // Wild + 4 minors — five-of-a-kind, flush, straight, or straight flush
    if (minors.length >= 4) {
      const combos4 = combinations(minors, 4);
      for (const combo of combos4) {
        if (isLegal5CardWildSet(combo)) {
          validCombos.push({ combo, desc: 'five-card set' });
        }
      }
    }

    // Score all valid combos and keep the top 3
    const scored = validCombos.map(({ combo, desc }) => {
      const testRealm = [...player.realm, ...combo, { type: 'major' }];
      const score = evaluateHand(testRealm);
      return { combo, desc, score };
    });
    scored.sort((a, b) => compareHands(b.score, a.score));

    // Deduplicate by card IDs
    const seen = new Set();
    const top = [];
    for (const entry of scored) {
      const key = entry.combo.map(c => c.id).sort().join(',');
      if (!seen.has(key)) {
        seen.add(key);
        top.push(entry);
      }
      if (top.length >= 3) break;
    }

    for (const { combo } of top) {
      actions.push({
        type: 'PLAY_WILD',
        card,
        withCards: combo,
        description: `Play ${cardName(card)} as wild with ${combo.map(cardName).join(', ')}`,
      });
    }
  }
}

/**
 * Check if 4 minor cards + a wild can form a legal 5-card set.
 * Legal 5-card sets: five-of-a-kind, flush, straight, straight flush.
 */
function isLegal5CardWildSet(minors) {
  const ranks = minors.map(c => c.numericRank);
  const suits = minors.map(c => c.suit);
  const uniqueRanks = [...new Set(ranks)];
  const uniqueSuits = [...new Set(suits)];

  // Five-of-a-kind: all 4 minors same rank, wild makes 5th
  if (uniqueRanks.length === 1) return true;

  // Flush: all 4 minors same suit, wild declared as same suit + any rank
  if (uniqueSuits.length === 1) return true;

  // Straight: 4 unique ranks where wild fills exactly one gap to make 5 consecutive
  if (uniqueRanks.length === 4) {
    const sorted = uniqueRanks.slice().sort((a, b) => a - b);
    const span = sorted[3] - sorted[0];

    // Perfect case: span of 4, wild extends at either end (e.g. 3,4,5,6 + wild=2 or 7)
    if (span === 3) return true;

    // Gap case: span of 4 with one gap the wild fills (e.g. 3,4,6,7 + wild=5)
    if (span === 4) {
      // Check there's exactly one missing rank in the span
      let gaps = 0;
      for (let r = sorted[0]; r <= sorted[3]; r++) {
        if (!uniqueRanks.includes(r)) gaps++;
      }
      if (gaps === 1) return true;
    }
  }

  return false;
}
```

## Important Notes

- Do NOT change how wilds are evaluated for **scoring** in `src/poker.js` or `src/scoring.js`. The "every suit and any value" behaviour is correct for scoring — only the **play validation** in `actions.js` needs to change.
- The `addCompletionActions` function (line ~135) handles adding cards to existing realm sets. If a wild is already in the realm, completion actions for that set are a separate path and should NOT be affected by this change.
- The `executeWildGen` function in `engine.js` doesn't need to change — it just moves cards from hand to realm. The validation happens at action generation time.

## Verify

1. Run `npx vitest run` — all tests should pass. Some tests may need updating if they relied on illegal wild combos being available.

2. Run this check to confirm AIs can no longer dump 5 unrelated cards:

```bash
node -e "
import { createInitialState } from './src/state.js';
import { getLegalActions } from './src/actions.js';
import { setupGen, drawPhase } from './src/engine.js';
import { createAIs } from './src/ai/index.js';
import { resolveWithAI } from './src/scoring.js';

let illegal = 0;
for (let seed = 1; seed <= 50; seed++) {
  const state = createInitialState(4, false, seed);
  const ais = createAIs(4, 'diverse', state.rng);
  const sit = setupGen(state);
  let r = sit.next();
  while (!r.done) r = sit.next(resolveWithAI(ais[r.value.playerIndex], r.value));
  if (state.gameEnded) continue;

  for (let pi = 0; pi < 4; pi++) {
    drawPhase(state, pi);
    const actions = getLegalActions(state, pi);
    const wilds = actions.filter(a => a.type === 'PLAY_WILD' && a.withCards.length === 4);
    for (const w of wilds) {
      const ranks = w.withCards.map(c => c.numericRank);
      const suits = new Set(w.withCards.map(c => c.suit));
      const uniqueRanks = [...new Set(ranks)];
      // If 4 different ranks AND multiple suits, check it's a valid straight
      if (uniqueRanks.length > 1 && suits.size > 1) {
        const sorted = uniqueRanks.sort((a,b) => a-b);
        const span = sorted[3] - sorted[0];
        if (span > 4) {
          console.log('ILLEGAL wild+4 at seed='+seed+' pi='+pi+': ranks='+sorted+' suits='+[...suits]);
          illegal++;
        }
      }
    }
  }
}
console.log(illegal === 0 ? 'PASS: No illegal wild+4 combos found' : illegal + ' illegal combos found');
"
```

3. Run a game length check to confirm rounds are now longer:

```bash
node -e "
import { createInitialState } from './src/state.js';
import { setupGen, playGameGen } from './src/engine.js';
import { createAIs } from './src/ai/index.js';
import { resolveWithAI } from './src/scoring.js';

const r1turns = [];
for (let seed = 1; seed <= 30; seed++) {
  const state = createInitialState(4, false, seed);
  const ais = createAIs(4, 'diverse', state.rng);
  for (let pi = 0; pi < 4; pi++) state.players[pi].name = ais[pi].name + '-' + (pi+1);
  const sit = setupGen(state);
  let r = sit.next();
  while (!r.done) r = sit.next(resolveWithAI(ais[r.value.playerIndex], r.value));
  if (state.gameEnded) continue;
  let actionCount = 0;
  let round = state.roundNumber;
  const pit = playGameGen(state);
  r = pit.next();
  while (!r.done) {
    if (state.roundNumber !== round) break;
    if (r.value && r.value.type === 'ACTION') actionCount++;
    r = pit.next(resolveWithAI(ais[r.value?.playerIndex ?? 0], r.value));
  }
  r1turns.push(actionCount);
}
const avg = (r1turns.reduce((a,b)=>a+b,0) / r1turns.length).toFixed(1);
console.log('Avg Round 1 turns: ' + avg + ' (expect 16+ for 4x around table)');
console.log('Range: ' + Math.min(...r1turns) + ' - ' + Math.max(...r1turns));
console.log(r1turns.filter(t => t < 12).length + ' / ' + r1turns.length + ' games with R1 < 3x around table');
"
```

## Commit

`Fix wild card play validation — wild + minors must form a legal set at time of play`

## Execution Rules

- This is a single fix, single commit
- Run `npx vitest run` after — update any failing tests if needed
- Do NOT change wild card scoring/evaluation logic (poker.js, scoring.js)
- Do NOT change other action generation functions
- If any test relies on now-illegal wild combos, update the test to use a legal combo instead
