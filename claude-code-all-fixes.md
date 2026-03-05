# Claude Code Prompt — Engine & Client Bug Fixes

## Context

Repo: https://github.com/RogersJohn/NewArcanaV2.0

Automated bug-hunting (90 game configurations) and manual playtesting have uncovered 7 bugs. Three are engine-level (one critical), two are AI logic errors, and two are client UI defects. These are listed in priority order — fix them in sequence.

Read the CLAUDE.md for full project context. After completing all fixes, regenerate simulation results since the critical bug (Fix 1) invalidates all existing data.

---

## Work Items (do each as a SEPARATE commit)

### Fix 1: Hands Not Gathered Between Rounds (CRITICAL)

**File**: `src/engine.js`, `resetForNextRound()` (line 1141)

**Bug**: When a round ends, `resetForNextRound` gathers realm cards, the draw pile, discard pile, and pit back into the deck and shuffles. However, players' hands are never cleared. Cards remaining in hand from the previous round stay, and `dealRoundCards` (line 1181) deals 6 new cards on top.

This means players routinely start Round 2 with 10-13 cards in hand. By Round 7, hand sizes of 13+ are common. Every simulation result, win rate, VP distribution, and card balance analysis produced so far is invalid.

Evidence from the Charity variant in RULES.md (p.15): players who scored no points may "carry one card from their hand into the next round" — this only makes sense as a special exception if hands are normally gathered.

**Fix**: In `resetForNextRound`, gather hand cards into the deck alongside realm cards. Replace the player loop (lines 1143-1148):

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
  // Gather realm cards
  for (const card of p.realm) {
    state.minorDiscard.push(card);
  }
  p.realm = [];

  // Gather hand cards (hands do not persist between rounds)
  for (const card of p.hand) {
    state.minorDiscard.push(card);
  }
  p.hand = [];

  // Tome persists
}
```

**Verify**: Run `npx vitest run`. Some tests may now fail because they assumed hand carry-over — update those tests if needed. Then run a quick check:

```bash
node -e "
import { createInitialState } from './src/state.js';
import { setupGen, playGameGen } from './src/engine.js';
import { createAIs } from './src/ai/index.js';
import { resolveWithAI } from './src/scoring.js';

const state = createInitialState(4, false, 42);
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
      if (p.hand.length > 7) { console.error('FAIL: ' + p.name + ' hand=' + p.hand.length); process.exit(1); }
    }
    lastRound = state.roundNumber;
  }
  r = pit.next(resolveWithAI(ais[r.value.playerIndex], r.value));
}
console.log('PASS: No hand bloat detected across', state.roundNumber, 'rounds');
"
```

All players should have exactly 6 cards in hand at the start of each round (before their first draw phase).

**Commit**: `Fix hands not gathered between rounds — players now start each round with fresh deal`

---

### Fix 2: Chariot Tome Overflow Ordering

**File**: `src/engine.js`, `resolveChariotGen()` (lines 661-672)

**Bug**: When a player uses the Chariot to take a celestial, the code pushes the celestial to the tome first (line 662: `player.tome.push(celestial)`), then checks for overflow (line 663: `if (player.tome.length > 3)`). This means the tome temporarily contains 4 cards. The `executeMajorTomeGen` function (line 506) handles this correctly — it discards BEFORE pushing. Chariot should follow the same pattern.

Additionally, the overflow discard on line 670 has no bounds check on `discardIdx` and no protection removal for the discarded card.

**Fix**: Replace lines 661-672:

```js
if (celestial) {
  player.tome.push(celestial);
  if (player.tome.length > 3) {
    const discardIdx = yield {
      type: DECISION_TYPES.TOME_DISCARD,
      playerIndex,
      state,
    };
    recordDecision(state, DECISION_TYPES.TOME_DISCARD, playerIndex, discardIdx);
    const discarded = player.tome.splice(discardIdx, 1)[0];
    state.pit.push(discarded);
  }
  log(state, `${player.name} takes ${cardName(celestial)} via Chariot`);
}
```

with:

```js
if (celestial) {
  // Check tome overflow BEFORE pushing (matches executeMajorTomeGen pattern)
  if (player.tome.length >= 3) {
    const discardIdx = yield {
      type: DECISION_TYPES.TOME_DISCARD,
      playerIndex,
      state,
    };
    recordDecision(state, DECISION_TYPES.TOME_DISCARD, playerIndex, discardIdx);
    if (discardIdx >= 0 && discardIdx < player.tome.length) {
      const discarded = player.tome.splice(discardIdx, 1)[0];
      state.pit.push(discarded);
      if (getProtection(state, discarded.number)) {
        player.tomeProtections.delete(getProtection(state, discarded.number));
      }
    }
  }
  player.tome.push(celestial);
  log(state, `${player.name} takes ${cardName(celestial)} via Chariot`);
}
```

**Verify**: Run `npx vitest run` — all tests pass. Run a batch of games and confirm no player's tome ever exceeds 3:

```bash
node -e "
import { createInitialState } from './src/state.js';
import { setupGen, playGameGen } from './src/engine.js';
import { createAIs } from './src/ai/index.js';
import { resolveWithAI } from './src/scoring.js';

for (let seed = 1; seed <= 20; seed++) {
  for (const np of [3, 4, 5]) {
    const state = createInitialState(np, false, seed);
    const ais = createAIs(np, 'diverse', state.rng);
    for (let pi = 0; pi < np; pi++) state.players[pi].name = ais[pi].name + '-' + (pi+1);
    const sit = setupGen(state);
    let r = sit.next();
    while (!r.done) r = sit.next(resolveWithAI(ais[r.value.playerIndex], r.value));
    const pit = playGameGen(state);
    r = pit.next();
    while (!r.done) {
      for (let i = 0; i < np; i++) {
        if (state.players[i].tome.length > 3) {
          console.error('FAIL: seed='+seed+' np='+np+' '+state.players[i].name+' tome='+state.players[i].tome.length);
          process.exit(1);
        }
      }
      r = pit.next(resolveWithAI(ais[r.value.playerIndex], r.value));
    }
  }
}
console.log('PASS: No tome overflow in 60 games');
"
```

**Commit**: `Fix Chariot tome overflow — discard before push, add bounds check and protection removal`

---

### Fix 3: Plague TOME_DISCARD Uses Wrong Player Index

**File**: `src/engine.js`, `resolvePlagueGen()` (lines 823-854)

**Bug**: When Plague targets a player whose tome is full, the TOME_DISCARD decision is yielded with `playerIndex` (line 830) — this is the **attacker**, not the **target** (`targets.playerIndex`). The AI then calls `chooseTomeDiscard(state, playerIndex)` which looks at the attacker's tome instead of the target's tome. The returned index is applied to the target's tome (line 834), but `Math.min` clamps it to prevent crashes. The wrong card gets discarded.

CARDS.md says "remove a card of **your** choice to Pit" — "your" most likely refers to the Plague player (the attacker). So the attacker should choose, but they should be choosing from the **target's** tome. This means the decision `playerIndex` should stay as the attacker (they decide), but the AI's `chooseTomeDiscard` needs to look at the correct tome. The simplest fix is to pass additional context.

However, the current `chooseTomeDiscard` interface only receives `(state, playerIndex)` and always looks at `state.players[playerIndex].tome`. Changing the interface would affect all AI classes. A simpler approach: yield the decision with `playerIndex` as the attacker but add a `targetPlayerIndex` field so the AI resolver can look at the right tome.

**Fix**: This is a two-part fix.

**Part A**: In `resolvePlagueGen`, add `targetPlayerIndex` to the yielded decision (line 828-832):

```js
if (target.tome.length >= 3) {
  const discardIdx = yield {
    type: DECISION_TYPES.TOME_DISCARD,
    playerIndex,
    targetPlayerIndex: targets.playerIndex,
    state,
  };
  recordDecision(state, DECISION_TYPES.TOME_DISCARD, playerIndex, discardIdx);
  if (discardIdx >= 0 && discardIdx < target.tome.length) {
    const discarded = target.tome.splice(discardIdx, 1)[0];
    if (getProtection(state, discarded.number)) {
      target.tomeProtections.delete(getProtection(state, discarded.number));
    }
    state.pit.push(discarded);
  }
}
```

**Part B**: In `src/scoring.js`, update the TOME_DISCARD resolver to use `targetPlayerIndex` when present. Find the `case DECISION_TYPES.TOME_DISCARD:` handler and change it from:

```js
case DECISION_TYPES.TOME_DISCARD:
  return ai.chooseTomeDiscard(request.state, request.playerIndex);
```

to:

```js
case DECISION_TYPES.TOME_DISCARD: {
  const tomeOwner = request.targetPlayerIndex ?? request.playerIndex;
  return ai.chooseTomeDiscard(request.state, tomeOwner);
}
```

This is backward-compatible — all other TOME_DISCARD yields (executeMajorTomeGen, resolveChariotGen, resolveHangedManGen) don't set `targetPlayerIndex`, so they fall back to `playerIndex` which is correct for those cases.

**Verify**: Run `npx vitest run` — all tests pass.

**Commit**: `Fix Plague TOME_DISCARD targeting wrong player's tome`

---

### Fix 4: AggressorAI `pickBestTarget` — Wrong Comparison Operator

**File**: `src/ai/aggressive.js`, line 85

**Bug**: The fallback logic reads `if (pi === playerIndex && ...)` — should be `pi !== playerIndex`. The fallback tries to target the AI itself instead of opponents.

**Fix**: Change line 85 from:

```js
if (pi === playerIndex && state.players[pi].realm.length > 0) {
```

to:

```js
if (pi !== playerIndex && state.players[pi].realm.length > 0) {
```

**Verify**: Run `npx vitest run` — all tests pass.

**Commit**: `Fix AggressorAI pickBestTarget fallback targeting self instead of opponents`

---

### Fix 5: AggressorAI Wastes Royal Attacks on Low-Value Targets

**File**: `src/ai/aggressive.js`, lines 30-34 and 92-99

**Bug**: `pickBestTarget` always returns non-null — line 99 falls back to `royalActions[0]` unconditionally. The AI always plays a Royal attack if it has one, even against worthless targets.

**Fix**: Replace lines 92-99 of `pickBestTarget`:

```js
// Find attacks targeting the leader
const targetAttacks = royalActions.filter(a =>
  a.target && a.target.playerIndex === bestPi
);
if (targetAttacks.length > 0) return targetAttacks[0];

// Any attack will do
return royalActions[0];
```

with:

```js
// If no valid target found, don't waste the card
if (bestPi === -1) return null;

// Find attacks targeting the best target
const targetAttacks = royalActions.filter(a =>
  a.target && a.target.playerIndex === bestPi
);
if (targetAttacks.length > 0) return targetAttacks[0];

// Fallback: any attack on a player with cards (avoid wasting on tiny realms)
const worthwhileAttacks = royalActions.filter(a => {
  const tp = state.players[a.target.playerIndex];
  return a.target.playerIndex !== playerIndex && tp.realm.length >= 2;
});
if (worthwhileAttacks.length > 0) return worthwhileAttacks[0];

return null;
```

The existing check on line 32 (`if (target) return target`) already guards against null.

**Verify**: Run `npx vitest run` — all tests pass.

**Commit**: `Fix AggressorAI wasting Royal attacks on low-value or empty targets`

---

### Fix 6: SWORDS Suit Colour Invisible on Dark Background

**File**: `client/src/utils/cardFormatting.js`, line 8

**Bug**: SWORDS colour is `#2c3e50` (dark blue-grey). Card background is `--bg-card: #0f3460` (dark blue). Nearly identical — Swords cards are invisible.

**Fix**: Change line 8 from:

```js
SWORDS: '#2c3e50',  // dark blue
```

to:

```js
SWORDS: '#5dade2',  // light blue (visible on dark backgrounds)
```

**Verify**: Run the client (`cd client && npm run dev`), start a game, confirm all four suits are clearly distinguishable.

**Commit**: `Fix Swords suit colour invisible on dark card backgrounds`

---

### Fix 7: Discard Prompt Gives No Explanation

**File**: `client/src/components/actions/DiscardChoice.jsx`

**Bug**: The discard prompt says "Discard 1 card from hand" with no context about why. In New Arcana, hand size = hand + realm, which is confusing without explanation.

**Fix**: Replace the `action-title` div (around line 48-49):

```jsx
<div className="action-title">
  Discard {numRequired} card{numRequired > 1 ? 's' : ''} from {zoneName}
</div>
```

with:

```jsx
<div className="action-title">
  Discard {numRequired} card{numRequired > 1 ? 's' : ''} from {zoneName}
  {type === 'DISCARD' && (
    <div className="action-subtitle" style={{ fontSize: '12px', color: '#8899aa', marginTop: '4px', fontWeight: 'normal' }}>
      Hand ({player.hand.length}) + Realm ({player.realm.length}) = {player.hand.length + player.realm.length} — limit is {state.config?.gameRules?.handSizeLimit ?? 6}{player.tome?.some(c => c.type === 'major' && c.number === 15) ? ' (Devil +1)' : ''}
    </div>
  )}
  {type === 'REALM_DISCARD' && (
    <div className="action-subtitle" style={{ fontSize: '12px', color: '#8899aa', marginTop: '4px', fontWeight: 'normal' }}>
      Realm has {player.realm.length} cards — maximum is 5
    </div>
  )}
</div>
```

**Verify**: Run the client, play until a discard phase triggers, confirm the subtitle shows the hand+realm calculation.

**Commit**: `Add hand size explanation to discard prompt`

---

## Post-Fix Tasks

After all 7 fixes are committed:

1. **Run full test suite**: `npx vitest run` — all tests must pass
2. **Regenerate all simulation results** (the hand-gathering fix invalidates all existing data):

```bash
node index.js --games 1000 --players 3 --ai diverse --seed 1 --json results/post-fix-3players.json
node index.js --games 1000 --players 4 --ai diverse --seed 1 --json results/post-fix-4players.json
node index.js --games 1000 --players 5 --ai diverse --seed 1 --json results/post-fix-5players.json
node index.js --games 1000 --card-balance --seed 1 --json results/card-balance-post-fix.json
```

3. **Update FIXES.md** with a new section documenting the hand-gathering bug and its impact on prior results
4. **Update CLAUDE.md** task checklist if appropriate

---

## Execution Rules

- Do each fix as a **separate commit** with the specified message
- Run `npx vitest run` after each fix — update failing tests if the fix legitimately changes expected behaviour (especially Fix 1)
- Do NOT refactor unrelated engine logic
- Do NOT start any new Workstream B tasks
- If any fix reveals a deeper issue, document it in FIXES.md but do NOT fix it in this session
