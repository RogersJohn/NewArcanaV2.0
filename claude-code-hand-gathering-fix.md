# Claude Code Prompt — URGENT: Fix Hands Not Gathered Between Rounds

## Context

Repo: https://github.com/RogersJohn/NewArcanaV2.0

Read the CLAUDE.md for full project context. This is a critical engine bug confirmed by playtesting. Players carry their hand cards into the next round and then receive 6 more on top, resulting in hand sizes of 12-13+ by Round 2. This is impossible in the physical game.

Evidence from playtesting log:
```
--- Collector-4's turn (hand: 13, realm: 0, tome: 1, vp: 0) ---
```

Evidence from RULES.md Charity variant (p.15): players who scored no points may "carry one card from their hand into the next round" — this only makes sense as a special exception if hands are normally gathered.

---

## Fix

**File**: `src/engine.js`, `resetForNextRound()` function (around line 1141)

**Bug**: When a round ends, `resetForNextRound` gathers realm cards, the draw pile, discard pile, and pit back into the deck and shuffles. However, players' hands are never cleared. Then `dealRoundCards` deals 6 new cards on top of whatever is already in hand.

**Change**: In the player loop inside `resetForNextRound`, gather hand cards into the deck alongside realm cards. Replace:

```js
for (const p of state.players) {
  for (const card of p.realm) {
    state.minorDiscard.push(card);
  }
  p.realm = [];
  // Tome persists
}
```

with:

```js
for (const p of state.players) {
  for (const card of p.realm) {
    state.minorDiscard.push(card);
  }
  p.realm = [];

  // Gather hand cards (hands do not persist between rounds — see Charity variant)
  for (const card of p.hand) {
    state.minorDiscard.push(card);
  }
  p.hand = [];

  // Tome persists
}
```

No other files need to change for this fix.

---

## Verify

1. Run `npx vitest run` — all tests should pass. If any tests assumed hand carry-over behaviour, update them to match the corrected logic.

2. Run this inline check to confirm no hand bloat:

```bash
node -e "
import { createInitialState } from './src/state.js';
import { setupGen, playGameGen } from './src/engine.js';
import { createAIs } from './src/ai/index.js';
import { resolveWithAI } from './src/scoring.js';

for (const seed of [1, 42, 100, 999]) {
  const state = createInitialState(4, false, seed);
  const ais = createAIs(4, 'diverse', state.rng);
  for (let pi = 0; pi < 4; pi++) state.players[pi].name = ais[pi].name + '-' + (pi+1);
  const sit = setupGen(state);
  let r = sit.next();
  while (!r.done) r = sit.next(resolveWithAI(ais[r.value.playerIndex], r.value));
  const pit = playGameGen(state);
  r = pit.next();
  let lastRound = 1;
  while (!r.done) {
    if (state.roundNumber !== lastRound) {
      for (let i = 0; i < 4; i++) {
        const p = state.players[i];
        if (p.hand.length > 7) {
          console.error('FAIL: seed=' + seed + ' ' + p.name + ' hand=' + p.hand.length + ' at round ' + state.roundNumber);
          process.exit(1);
        }
      }
      lastRound = state.roundNumber;
    }
    r = pit.next(resolveWithAI(ais[r.value.playerIndex], r.value));
  }
}
console.log('PASS: No hand bloat detected across 4 seeds');
"
```

---

## Commit

`Fix hands not gathered between rounds — players now start each round with fresh deal`

## Execution Rules

- This is a single fix, single commit
- Run `npx vitest run` after — update any failing tests if needed
- Do NOT fix any other bugs in this session
- Do NOT regenerate simulation results yet (that will be done in a separate session after all fixes land)
