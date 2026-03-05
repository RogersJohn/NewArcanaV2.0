# Claude Code Prompt — Playtest Bug Fixes (Post-Workstream B)

## Context

Repo: https://github.com/RogersJohn/NewArcanaV2.0

The browser game client (Workstream B) has been built and is undergoing human playtesting. Three issues have been found during the first playtest session. Two are code bugs and one is a UX deficiency. All three are in-scope fixes that do not require engine redesign.

Read the CLAUDE.md for full project context. These fixes must NOT change engine rules, scoring, or simulation logic. All 170 existing tests must continue to pass after each fix.

---

## Work Items (do each as a SEPARATE commit)

### Fix 1: AggressorAI `pickBestTarget` Bug — Wrong Comparison Operator

**File**: `src/ai/aggressive.js`, line 85

**Bug**: In the `pickBestTarget` method, the fallback logic on line 85 reads:

```js
if (pi === playerIndex && state.players[pi].realm.length > 0) {
```

This should be `pi !== playerIndex`. As written, the fallback only considers targeting the AI **itself** rather than opponents. This means when no opponent has both VP > 0 AND cards in realm, the fallback tries to attack its own realm instead of finding any opponent with realm cards.

**Fix**: Change `===` to `!==` on line 85:

```js
if (pi !== playerIndex && state.players[pi].realm.length > 0) {
```

**Verify**: Run `npx vitest run` — all tests pass.

**Commit**: `Fix AggressorAI pickBestTarget fallback targeting self instead of opponents`

---

### Fix 2: AggressorAI Plays Royal Attacks Without Evaluating Whether They're Worthwhile

**File**: `src/ai/aggressive.js`, lines 30–34 and lines 92–99

**Bug**: The `chooseAction` method has Royal attacks as Priority 1 (line 30). It calls `pickBestTarget(royalActions, state, playerIndex)` and if the function returns anything, the AI takes that action. But `pickBestTarget` always returns a non-null value — line 99 falls back to `royalActions[0]` unconditionally. This means the AI will always play a Royal attack card if it has one, even when:

- The only available targets are low-value single cards not worth wasting an attack on
- The AI would be better served playing cards to its own realm
- The attack target has tome protection (the card is wasted — goes to Pit for nothing)

This was observed in playtesting: AI players used Royal attacks to target the human player's realm when it contained no strategically valuable cards. The human described it as "pointless actions."

**Fix**: Make `pickBestTarget` return `null` when no worthwhile target exists, and update `chooseAction` to check for null before committing to the attack.

In `pickBestTarget`, replace the final fallback block (lines 92–99):

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

// Fallback: any attack on a player with cards (avoid wasting on empty/tiny realms)
const worthwhileAttacks = royalActions.filter(a => {
  const tp = state.players[a.target.playerIndex];
  return a.target.playerIndex !== playerIndex && tp.realm.length >= 2;
});
if (worthwhileAttacks.length > 0) return worthwhileAttacks[0];

return null;
```

In `chooseAction`, the existing check on line 32 (`if (target) return target`) already guards against null, so no change needed there — the null return will cause it to fall through to the next priority.

**Verify**: Run `npx vitest run` — all tests pass. Then run a quick manual check:

```bash
node index.js --single --players 4 --ai all-aggressor --verbose --seed 42 2>&1 | grep "attacks" | head -20
```

Confirm that attacks are targeting players with realm cards, not wasting on empty realms.

**Commit**: `Fix AggressorAI wasting Royal attacks on low-value or empty targets`

---

### Fix 3: SWORDS Suit Colour Nearly Invisible on Dark Background

**File**: `client/src/utils/cardFormatting.js`, line 8

**Bug**: The SWORDS suit colour is `#2c3e50` (dark blue-grey). The card background colour is `--bg-card: #0f3460` (dark blue). These are nearly identical, making Swords cards almost completely illegible. During playtesting, the human player could not see 2 of their 5 hand cards because they were Swords (Clubs) suit — they appeared as dark featureless rectangles.

This affects:
- Card rank text (inherits suit colour via `style.color = suitColor` in Card.jsx)
- Card border (set to suit colour)
- Suit symbol

**Fix**: Change the SWORDS colour to a lighter, more visible shade that still reads as "blue/dark" thematically. Replace:

```js
SWORDS: '#2c3e50',  // dark blue
```

with:

```js
SWORDS: '#5dade2',  // light blue (visible on dark backgrounds)
```

This is a bright but not garish blue that provides strong contrast against the `#0f3460` card background, similar to how CUPS (red) and COINS (gold) already stand out clearly.

**Verify**: Run the client (`cd client && npm run dev`), start a game, and visually confirm that Swords cards are clearly legible. All four suits should be easily distinguishable:

- WANDS (♣): green `#2d8a4e`
- CUPS (♥): red `#c0392b`
- SWORDS (♠): light blue `#5dade2`
- COINS (♦): gold `#d4a017`

**Commit**: `Fix Swords suit colour invisible on dark card backgrounds`

---

### Fix 4: Discard Prompt Gives No Explanation of Why Player Must Discard

**File**: `client/src/components/actions/DiscardChoice.jsx`

**Bug**: When the discard phase triggers, the UI shows "Discard 1 card from hand" with no context. In New Arcana, the hand size limit counts hand + realm cards together (see RULES.md "Draw Phase" and "Discard Phase"). A player with 5 cards in hand and 2 cards in realm has a combined size of 7, exceeding the limit of 6. Being told to discard feels wrong if you don't understand the combined counting rule.

During playtesting, the human player believed they were being asked to discard incorrectly because they could only see 3 of their 5 hand cards (Fix 3) and didn't understand the hand+realm combined limit.

**Fix**: Update the discard prompt to show the calculation. In `DiscardChoice.jsx`, add context explaining why discards are needed.

Replace the `action-title` div (around line 48-49):

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

**Verify**: Run the client (`cd client && npm run dev`), play until a discard phase triggers, and confirm the subtitle shows the hand+realm calculation. If the Devil card is in your tome, confirm the "+1" note appears.

**Commit**: `Add hand size explanation to discard prompt`

---

## Execution Rules

- Do each fix as a **separate commit** with the specified message
- Run `npx vitest run` after each fix — all 170 tests must pass
- Do NOT refactor engine logic, scoring, or simulation code
- Do NOT start any other Workstream B tasks
- If any fix reveals a deeper issue, document it in a new section of FIXES.md but do NOT fix it in this session
