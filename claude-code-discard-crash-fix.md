# Claude Code Prompt — Fix DiscardChoice Submitting Card Objects Instead of Index Arrays

## Context

Repo: https://github.com/RogersJohn/NewArcanaV2.0

Read the CLAUDE.md for full project context. This is a crash bug in the game client. When the human player needs to discard cards, the game crashes with:

```
[ERROR] Engine crashed: indices is not iterable
[ERROR] Stack: TypeError: indices is not iterable
    at discardPhaseGen (engine.js:337:25)
```

## The Bug

**File**: `client/src/components/actions/DiscardChoice.jsx`, `handleConfirm()` (line 37-44)

The engine's `discardPhaseGen` yields a DISCARD decision and expects the response to be an **array of numeric indices** (indices into the player's hand array, sorted descending). The AI resolver (`chooseDiscard` in `src/ai/base.js`) correctly returns `number[]`.

But `DiscardChoice.jsx` submits **card objects**, not indices. And when only 1 card needs to be discarded, it unwraps the array and submits a single card object:

```js
const handleConfirm = () => {
  const discards = selected.map(i => sourceCards[i]);  // card objects, not indices
  if (numRequired === 1) {
    onSubmit(discards[0]);   // single card object, not an array
  } else {
    onSubmit(discards);      // array of card objects, not indices
  }
};
```

The engine then does `for (const idx of indices)` on whatever was submitted. A single card object is not iterable → crash.

This bug was masked before the hand-gathering fix because discard rarely triggered for the human player when hands were bloated. Now that hands are correct (6 cards), discard triggers normally and crashes every time.

## The Fix

**File**: `client/src/components/actions/DiscardChoice.jsx`

Replace the `handleConfirm` function. It must submit an **array of numeric indices** (into the source cards array), always as an array, sorted descending (highest index first so that sequential splicing doesn't shift remaining indices):

```js
const handleConfirm = () => {
  // Engine expects an array of numeric indices, sorted descending
  const sortedIndices = [...selected].sort((a, b) => b - a);
  onSubmit(sortedIndices);
};
```

The `selected` state variable already contains the numeric indices the user clicked — it's populated by `toggleCard(index)` which stores `i` from the `.map((card, i) => ...)` loop. So no mapping is needed, just sort and submit.

This handles all three discard types (DISCARD, REALM_DISCARD, TOME_DISCARD) because `DiscardChoice.jsx` is used for all of them.

**However**, TOME_DISCARD is special — the engine expects a single numeric index, not an array. Check how `executeMajorTomeGen` handles it (engine.js ~line 507-520): it yields `TOME_DISCARD` and expects a single number back. The `numRequired` for TOME_DISCARD is set to 1 on line 19 of DiscardChoice.jsx.

So the fix needs to handle TOME_DISCARD differently:

```js
const handleConfirm = () => {
  if (type === 'TOME_DISCARD') {
    // Engine expects a single numeric index for tome discard
    onSubmit(selected[0]);
  } else {
    // Engine expects an array of numeric indices, sorted descending
    const sortedIndices = [...selected].sort((a, b) => b - a);
    onSubmit(sortedIndices);
  }
};
```

## Verify

1. Run `npx vitest run` — all tests should pass (this is a client-only fix).

2. Run the client (`cd client && npm run dev`), start a game, and play cards until your hand + realm exceeds 6. Confirm:
   - The discard prompt appears
   - You can select card(s) and confirm
   - The game continues without crashing
   - The discarded card(s) disappear from your hand
   - The game log shows the discard correctly

3. If possible, trigger a REALM_DISCARD (get 6+ cards in realm via playing a set that pushes past 5) and a TOME_DISCARD (play a 4th Major to your Tome) to confirm all three discard types work.

## Commit

`Fix DiscardChoice submitting card objects instead of index arrays`

## Execution Rules

- This is a single fix, single commit
- Client-only change — do NOT modify any engine files
- Do NOT change how AI discards work (they're already correct)
