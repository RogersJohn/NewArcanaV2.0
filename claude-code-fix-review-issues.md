# Claude Code Prompt: Fix Review Issues & Add Editor Tooltips

## Context

A previous pass completed repo cleanup, PRNG fixes, data-driven effect resolution, and the card editor. A code review found issues that undermine the core goal: letting the game designer (Danny) change card values and add new cards purely through the editor and `data/cards.json`, with zero source code edits. This prompt fixes those issues and adds comprehensive tooltips to the editor.

There are 5 phases. Complete each fully. Run `npx vitest run` after each phase. Do not proceed to the next phase until all tests pass.

---

## Phase 1: Eliminate the `bonusCards` Duplication

### Problem

Bonus card config exists in TWO places: `config.bonusCards` (a map keyed by card number) and `config.majorArcana[].effect.bonus`. The scoring code in `src/scoring.js` checks `bonusCards` FIRST (line 169) and only falls back to `effect.bonus`. The card editor only edits `majorArcana[].effect.bonus`. This means Danny's edits in the editor are silently ignored because the stale `bonusCards` map always wins.

### Fix

**1.1** In `src/scoring.js`, reverse the lookup priority in `resolveBonusGen`. Change it to check `effect.bonus` FIRST (from the card's own effect definition via `getCardEffect()` or from the matching `majorArcana[]` entry in config), and only fall back to `bonusCards` if no effect bonus is found. This way the `effect.bonus` definition is authoritative, and `bonusCards` exists only as a legacy fallback.

The new lookup should be:

```javascript
// 1. Check card's effect definition (authoritative — this is what the editor edits)
const effect = getCardEffect(state, card);
let bonusCfg = effect?.bonus;

// 2. Fallback to bonusCards map (legacy compat)
if (!bonusCfg) {
  bonusCfg = state.config?.bonusCards?.[card.number];
}
```

Apply the same fix to the Hermit-specific lookup (around line 88 in scoring.js) and the Magician lookup (around line 254). For Magician, `vp`, `countWilds`, and `requiresStrictAdvantage` should be read from the card's `effect.bonus` first.

**1.2** Remove the `bonusCards` section from `data/cards.json` and from `getDefaultConfig()` in `src/config-core.js`. All bonus definitions now live in `majorArcana[].effect.bonus`. Remove the corresponding `bonusCards` property entirely — don't leave it as an empty object.

**1.3** Update the `mergeConfig` function if necessary to handle configs that don't have a `bonusCards` key.

**1.4** Grep for every remaining reference to `bonusCards` in `src/` and ensure they all have fallback behavior (i.e., they don't crash if `bonusCards` is undefined). You can keep the fallback reads, but they should never be the primary source.

**1.5** Run all tests. Fix any that relied on `bonusCards` existing.

**Commit:** `fix: remove bonusCards duplication — effect.bonus is now authoritative`

---

## Phase 2: Wire Up `deriveProtectionMap` and Fix `state.js` Devil Check

### Problem A: `deriveProtectionMap` is dead code

`deriveProtectionMap()` in `effect-resolver.js` correctly scans `majorArcana` entries for `onPlay.action === 'PROTECT_SUIT'` and builds a protection map. But nobody calls it. The engine still uses the explicit `protectionMap` config key and falls back to the hardcoded `PROTECTION_MAP` constant in `cards.js`. If Danny adds a new protection card through the editor, it won't work.

### Fix A

**2.1** In `src/state.js`, in the `createInitialState` function (or wherever the config is first attached to the state), call `deriveProtectionMap(state.config)` and merge the result INTO `state.config.protectionMap`. The derived map should override/supplement the explicit one. This way any card with `PROTECT_SUIT` in its effect automatically registers.

```javascript
import { deriveProtectionMap } from './effect-resolver.js';

// After config is set on state:
const derivedProt = deriveProtectionMap(state.config);
state.config.protectionMap = { ...state.config.protectionMap, ...derivedProt };
```

**2.2** Remove the explicit `protectionMap` section from `data/cards.json` and from `getDefaultConfig()`. It's now fully derived. Keep the `PROTECTION_MAP` constant in `cards.js` as a hardcoded fallback for edge cases where state has no config (tests, etc.), but the primary path should use the derived map.

### Problem B: `getEffectiveHandLimit` hardcodes Devil by number

`src/state.js` line 113: `const hasDevil = player.tome.some(c => c.type === 'major' && c.number === 15)`. This checks for the Devil card by number 15 to determine the hand limit. If Danny creates a new card that also changes the hand limit (using `DRAW_TO_LIMIT`), it won't be detected.

### Fix B

**2.3** Change `getEffectiveHandLimit` to check for any tome card with `onPlay.action === 'DRAW_TO_LIMIT'` in its effect definition, and use that card's `onPlay.limit` value. This requires access to the config's `majorArcana` array to look up effect definitions.

```javascript
export function getEffectiveHandLimit(player, config) {
  const normalLimit = config?.gameRules?.handSizeLimit ?? 6;

  // Check if any tome card has a DRAW_TO_LIMIT on-play effect
  for (const card of player.tome) {
    if (card.type !== 'major') continue;
    const def = config?.majorArcana?.find(m => m.number === card.number);
    const onPlay = def?.effect?.onPlay;
    if (onPlay?.action === 'DRAW_TO_LIMIT') {
      return onPlay.limit ?? config?.gameRules?.devilHandSizeLimit ?? 7;
    }
  }

  return normalLimit;
}
```

**2.4** Run all tests. The Devil behavior should be unchanged (same limit value), but now any card with DRAW_TO_LIMIT will also work.

**Commit:** `fix: derive protectionMap from effects, make hand limit config-driven`

---

## Phase 3: Sync `MAJOR_ARCANA_DEFS` and Add Missing Tests

### Problem: `MAJOR_ARCANA_DEFS` lacks effect fields

The `MAJOR_ARCANA_DEFS` array in `src/cards.js` does NOT have `effect` fields, while `config-core.js` and `data/cards.json` do. Code that creates cards from `MAJOR_ARCANA_DEFS` (like `createMajorDeck` and `createMajorCard`) produces card objects without effects. The effect resolver handles this by looking up effects from `state.config`, but this creates a fragile dependency.

### 3.1 Add `effect` fields to `MAJOR_ARCANA_DEFS`

Copy the effect definitions from `config-core.js` into `MAJOR_ARCANA_DEFS` in `cards.js`, so every entry has its `effect` field. The `createMajorCard` function should copy the `effect` field onto the card object:

```javascript
export function createMajorCard(number, name, category, keywords) {
  const def = MAJOR_ARCANA_DEFS.find(d => d.number === number);
  return {
    id: nextId++,
    type: 'major',
    number,
    name,
    category,
    keywords: keywords || def?.keywords || [],
    suit: def?.suit || null,
    purchaseValue: number,
    effect: def?.effect || null,  // <-- ADD THIS
  };
}
```

### 3.2 Add missing tests

Add the following tests to `test/effect-resolver.test.js`:

**a) End-to-end custom card bonus scoring:**

Create a state, add a custom card (e.g., number 99) with `effect.bonus: { bonusType: 'suitHighest', suit: 'WANDS', vp: 2 }` to `state.config.majorArcana`. Put that card in a player's tome. Give the player realm cards with wands. Call `resolveBonus(state, playerIndex, card, ais)` and verify it returns 2 VP. This proves the data-driven path works end-to-end.

**b) Custom card bonus scoring with `suitMajority`:**

Same setup but use `bonusType: 'suitMajority'` with `requiresStrictAdvantage: true`. Verify the player scores VP when they have more of the suit, and 0 when tied.

**c) Custom PROTECT_SUIT card registers automatically:**

Create a state, add a custom card with `onPlay: { action: 'PROTECT_SUIT', suit: 'COINS' }` to config. Trigger `createInitialState` (or manually call `deriveProtectionMap` and merge). Verify the protection map includes the custom card.

**d) Deterministic reproducibility:**

Run `playGame` twice with the same seed and player count. Verify both runs produce identical results (same VP distribution, same game end reason, same number of rounds). This proves the PRNG fix didn't miss anything.

```javascript
it('same seed produces identical game results', () => {
  function runGame(seed) {
    const state = createInitialState(4, false, seed);
    const ais = createAIs(4, 'diverse', state.rng);
    for (let pi = 0; pi < 4; pi++) state.players[pi].name = `P${pi}`;
    setup(state, ais);
    playGame(state, ais);
    return {
      vpDist: state.players.map(p => p.vp),
      endReason: state.gameEndReason,
      rounds: state.roundNumber,
    };
  }
  const r1 = runGame(12345);
  const r2 = runGame(12345);
  expect(r1).toEqual(r2);
});
```

**e) `getCardEffect` returns null for minor cards:**

```javascript
it('returns null for minor cards', () => {
  const state = makeState();
  const minor = createMinorCard('CUPS', 5);
  expect(getCardEffect(state, minor)).toBe(null);
});
```

**f) `isDeathCard` / `isPlagueCard` return false for minor cards:**

```javascript
it('returns false for minor cards', () => {
  const state = makeState();
  const minor = createMinorCard('CUPS', 5);
  expect(isDeathCard(state, minor)).toBe(false);
  expect(isPlagueCard(state, minor)).toBe(false);
});
```

**g) `resolveTomeOnPlayGen` generator executes correctly:**

Test that calling `resolveTomeOnPlayGen` for a Devil card actually draws cards, and for a custom PROTECT_SUIT card actually adds protection. Drive the generator to completion manually.

**h) Graceful handling when `getCardEffect` returns null (no effect defined):**

Create a card object with no effect and no matching config entry. Verify `getActionHandler` returns null, `getTomeOnPlayHandler` returns null, and the engine's switch on `handler` silently does nothing.

**i) Config change affects scoring:**

Create a state. Modify `state.config.majorArcana` to change The Empress's bonus VP from 1 to 3. Put The Empress in a player's tome with realm cards that meet the bonus. Call `resolveBonus`. Verify it returns 3, not 1.

### 3.3 Run all tests

**Commit:** `fix: sync MAJOR_ARCANA_DEFS effects, add missing test coverage`

---

## Phase 4: Add Tooltips to the Card Editor

Danny is a game designer, not a programmer. Every field and option in the editor needs a tooltip explaining what it does in game terms. Use a consistent tooltip pattern throughout.

### 4.1 Create a `Tooltip` component

In `editor/src/components/Tooltip.jsx`, create a reusable tooltip wrapper:

```jsx
export default function Tooltip({ text, children }) {
  // Render an inline (?) icon next to the children.
  // On hover, show the tooltip text in a floating dark box.
  // Use position: absolute with z-index to float above other content.
  // Keep it simple — CSS-only hover, no library needed.
}
```

Also create a `HelpIcon` variant that's just the (?) circle that can be placed next to labels.

### 4.2 Add tooltip text constants

Create `editor/src/utils/tooltips.js` with all tooltip strings organized by section. This is the definitive reference. Be specific and use game terms Danny will recognize. Here are the tooltips to include:

**Card fields:**
- **Number**: "Unique ID for this card. Determines purchase cost from the display (higher number = more expensive). Cannot overlap with another card's number."
- **Name**: "Display name shown to players during the game."
- **Category**: "Determines how this card is used:\n• Action — played from hand for an immediate effect, then goes to the Pit\n• Tome — placed in your Tome for ongoing/round-end benefits\n• Celestial — placed in Tome, worth VP at game end, 3 = instant win\n• Bonus-round — placed in Tome, scores VP at the end of each round"
- **Suit**: "If set, this card is associated with a suit. Affects bonus evaluation for cards like High Priestess (Wands), Empress (Cups), etc. Most cards have no suit."
- **Keywords**: "Tags that affect game logic. 'bonus' means the card has a round-end scoring effect. 'tome' means it can be played to Tome. 'action' means it has an active play effect. 'game-end' means revealing this card ends the game. 'celestial' marks celestial win-condition cards."

**Action effect types:**
- **MOVE_CELESTIAL_TO_TOME**: "Take a face-up Celestial from any Realm, Tome, Display, or Major discard pile and place it in your Tome. (The Chariot)"
- **MOVE_MAJOR_TO_REALM**: "Take a face-up Major Arcana from any Realm or Tome and place it in your Realm as a wild card. (Strength)"
- **WHEEL_OF_FORTUNE**: "Draw 2 cards from Major sources (deck, display, discard), keep 1, pit the other. (Wheel of Fortune)"
- **STEAL_FROM_TOME**: "Take one card from an opponent's Tome and place it in your Tome. (The Hanged Man)"
- **TOWER_DESTROY**: "Destroy the top card in every opponent's Tome that has MORE cards than yours. (The Tower)"
- **CLAIM_ROUND_END_MARKER**: "Immediately take the round-end marker. The round ends at the start of your next turn. (Judgement)"
- **PLAGUE_TO_TOME**: "Place this card into any player's Tome. It inflicts a VP penalty at game end. (Plague)"
- **Game-end trigger**: "When this card is revealed in the display, the game ends immediately. (Death)"

**Tome on-play actions:**
- **PROTECT_SUIT**: "While in your Tome, protects all cards of the chosen suit in your Realm from Royal attacks (Page/Knight/Queen). (Temperance, Faith, Hope, Prudence)"
- **DRAW_TO_LIMIT**: "When played to Tome, draw minor cards until your total hand+realm size reaches the limit. Also raises your discard-phase hand limit to this value while in your Tome. (The Devil)"
- **TOME_CARDS_TO_HAND**: "When played to Tome, take all OTHER cards currently in your Tome into your hand. Only this card remains. (The Hermit)"

**Bonus types:**
- **foolDuplicate**: "Copy an opponent's Tome bonus card and evaluate it as if it were yours. Only duplicates round-end bonuses. (The Fool)"
- **suitMajority**: "Score VP if you have MORE cards of a named suit in your Realm than any other player. The player chooses which suit at round end. (The Magician)"
- **suitHighest**: "Score VP if you have the highest count of the specified suit among all players. Tied counts may or may not score depending on the 'Allow tie' setting."
- **pairCounting**: "Score VP for each pair of cards with matching rank in your Realm. (The Lovers)"
- **hermitExclusive**: "Score VP only if this is the ONLY card in your Tome. (The Hermit)"
- **noSuitInRealm**: "Score VP if you have ZERO cards of the specified suit in your Realm. (Temperance/Faith/Hope/Prudence bonuses)"
- **hierophant_blessing**: "Not a scoring bonus itself. When this card is in your Tome, any OTHER bonus card that fails to score gives 1 VP instead of 0. (The Hierophant)"

**Bonus parameters:**
- **VP**: "Victory points awarded when this bonus is scored."
- **VP per Pair**: "Victory points awarded for each matching-rank pair found in the player's Realm."
- **Suit**: "The suit this bonus evaluates. Only cards of this suit in the Realm count."
- **Requires strict advantage**: "If checked, the player must have STRICTLY MORE than all opponents. Ties score 0."
- **Count wilds**: "If checked, wild cards (Major Arcana in Realm) count as the evaluated suit."
- **Allow tie**: "If checked, a tied count still scores. If unchecked, must have strictly more than all opponents."
- **Requires choice**: "If checked, the player chooses which suit to evaluate at round end (Magician)."

**Celestial fields:**
- **VP at Game End**: "Victory points this card is worth when it's in your Tome/Realm at the end of the game."
- **Win Condition Group**: "Cards in the same group count toward the instant-win condition. Default: 'celestial'. Collecting 3 cards of the same group wins the game immediately."

**Game Rules tooltips:**
- **Hand Size Limit**: "Maximum number of cards (hand + realm) before the discard phase triggers. Default: 6."
- **Devil Hand Size Limit**: "Maximum hand+realm size for a player with a DRAW_TO_LIMIT card in their Tome. Default: 7. (Legacy name — now applies to any card with the DRAW_TO_LIMIT effect.)"
- **Tome Capacity**: "Maximum number of cards allowed in a player's Tome. When exceeded, one must be discarded. Default: 3."
- **Realm Trigger**: "When a player has this many cards in their Realm at the end of their turn, they take the round-end marker. Default: 5."
- **Display Slots**: "Number of face-up Major Arcana cards in the display. Default: 3."
- **Max Turns Per Round**: "Safety limit to prevent infinite loops. Default: 50."
- **Max Rounds**: "Safety limit. Default: 20."
- **Initial Deal Count**: "Minor cards dealt to each player at game start. Default: 5."
- **Round Deal Count**: "Target hand+realm size when drawing at the start of each round. Players draw up to this number (minimum 1). Default: 6."

**Buy Prices tooltips:**
- **Draw Pile Top**: "Minimum purchase value of minor cards in hand needed to buy the top card from the draw pile. Default: 6."
- **Display Slot 1/2/3**: "Minimum purchase value needed to buy from display slot 1 (newest, cheapest), 2, or 3 (oldest, most expensive). Defaults: 7, 8, 9."
- **Discard Top**: "Minimum purchase value needed to buy from the discard pile. Default: 10."

**Scoring tooltips:**
- **Celestial VP**: "VP awarded per Celestial card in Tome/Realm at game end. Default: 2."
- **Plague VP**: "VP penalty per Plague card in Tome at game end. Should be negative. Default: -3."
- **Celestial Win Count**: "Number of Celestial cards needed to trigger an instant win. Default: 3."
- **Pot Initial Per Player**: "VP added to the pot at game start per player. Default: 1."
- **Pot Growth Per Round**: "VP added to the pot at the start of each new round. Default: 1."
- **Max Payment Cards**: "Maximum number of minor cards that can be used as payment in a single buy action. Default: 3."

### 4.3 Apply tooltips to all editor components

Go through every editor component and add a tooltip next to each label:

- `CardEditor.jsx` — Number, Name, Category, Suit, Keywords fields
- `EffectEditor.jsx` — Action type dropdown, game-end trigger checkbox, on-play action dropdown, protected suit, draw limit
- `BonusEditor.jsx` — Bonus type dropdown, VP, VP per pair, suit, all checkboxes
- `GameRulesEditor.jsx` — Every field in Game Rules, Buy Prices, Scoring, and Other sections
- `CardList.jsx` — Add a small help text under the filter dropdown: "Cards are defined in data/cards.json. Changes here are in-memory only until exported."

### 4.4 Style the tooltips consistently

The tooltip should appear on hover with a small delay (~200ms). Use a dark background (gray-900 or similar) with light text, rounded corners, max-width ~300px, and a subtle border. Position it above or to the right of the (?) icon. On narrow screens, ensure it doesn't overflow the viewport.

### 4.5 Commit

**Commit:** `feat: add comprehensive tooltips to card editor`

---

## Phase 5: AI Card Number References (Documentation Only)

The 10 AI persona files contain ~51 hardcoded card-number references (`card.number === 15`, `card.number === 7`, etc.) used for heuristic scoring — e.g., "if the card is the Devil, rate it highly." These are not game logic bugs; they're AI strategy preferences.

### 5.1 Do NOT refactor the AI files

Refactoring all 10 AI files to use effect-based lookups would be a large, risky change that could break AI behavior in subtle ways. The AI heuristics are tuned and tested. Leave them alone.

### 5.2 Document the limitation

Add a section to `CLAUDE.md` under a new heading `## Known Limitations`:

```markdown
## Known Limitations

### AI Personas and Custom Cards
The 10 AI persona files in `src/ai/` contain hardcoded card-number references for
strategic heuristics (e.g., "if it's the Devil, rate it highly"). This means:

- **Existing cards**: AI plays correctly. Changing a card's VP values or bonus
  parameters in the editor WILL affect AI behavior correctly (AIs use the scoring
  engine which is fully data-driven).
- **New cards**: AI will treat new cards as generic/unrecognized and play them
  with default (low) priority. The AI won't know that your new card is powerful
  until someone adds explicit heuristics for it in the relevant AI file.
- **Changing what a card DOES** (e.g., making The Chariot do something other than
  MOVE_CELESTIAL_TO_TOME): The AI may play it at the wrong time because it still
  thinks it does the old thing. The card WILL work correctly — the engine is
  data-driven — but the AI's strategic evaluation will be stale.

This is acceptable for playtesting balance changes. If Danny adds significant new
cards that AI should play well, a developer should update the relevant AI files.
```

### 5.3 Commit

**Commit:** `docs: document AI limitations with custom cards`

---

## Final Verification Checklist

Run these after all phases are complete:

```bash
# All tests pass (should be ~200+ with new tests)
npx vitest run

# No Math.random in game code
grep -rn "Math.random" src/ | grep -v rng.js | grep -v "comment"

# No hardcoded card numbers in engine/effects/scoring
grep -rn "\.number === [0-9]" src/engine.js src/effects.js src/scoring.js src/state.js

# bonusCards section removed
grep -rn "bonusCards" src/config-core.js data/cards.json

# protectionMap section removed from config (now derived)
grep -rn '"protectionMap"' data/cards.json

# Simulation still works
node index.js --games 50 --players 4 --ai diverse --seed 42

# Editor loads without errors (manual check)
cd editor && npm install && npm run dev
```
