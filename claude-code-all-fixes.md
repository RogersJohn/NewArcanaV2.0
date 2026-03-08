# Claude Code Prompt: Fix All Outstanding Bugs & Implement All Features

## Context

This prompt covers 10 outstanding items from a detailed rules review with the game designer (Danny). Items are ordered by dependency: engine bugs first, then features, then AI intelligence, then UI polish. Run `npx vitest run` after each phase. Do not proceed to the next phase until all tests pass.

---

## Phase 1: Engine Bug Fixes (5 bugs)

### 1A. The Fool — Evaluate from Owner's Perspective

**Bug:** In `src/scoring.js`, `resolveFoolGen` calls `resolveBonusGen(state, pi, card)` where `pi` is the opponent. It should evaluate from the Fool owner's perspective: `resolveBonusGen(state, playerIndex, card)`.

The Fool copies an opponent's bonus card's RULES into the Fool owner's context. The owner's Realm is checked against the bonus requirements. The owner makes any decisions (e.g., Magician suit choice).

**Fix:**
```javascript
function* resolveFoolGen(state, playerIndex) {
  let bestBonus = 0;
  if (state.players[playerIndex].realm.length === 0) return 0; // Owner needs realm cards
  for (let pi = 0; pi < state.players.length; pi++) {
    if (pi === playerIndex) continue;
    for (const card of state.players[pi].tome) {
      if (!isBonusCard(card)) continue;
      const bonusVp = yield* resolveBonusGen(state, playerIndex, card); // playerIndex, NOT pi
      if (bonusVp > bestBonus) bestBonus = bonusVp;
    }
  }
  return bestBonus;
}
```

Two changes: (1) `playerIndex` instead of `pi` in `resolveBonusGen`, (2) early return 0 if owner has no realm cards.

**Tests (add to `test/card-comprehensive.test.js`):**
- Fool does NOT score when opponent meets a bonus but owner doesn't (e.g., opponent has most Swords via Justice, owner has 0 Swords)
- Fool DOES score when owner meets the duplicated requirement
- Fool returns 0 when owner has empty realm
- Fool duplicating Magician: owner's AI chooses the suit (use FixedSuitAI choosing CUPS, verify it evaluates owner's CUPS count)
- Fool duplicating Lovers: evaluates pairs in owner's Realm, not opponent's

**Update existing Fool tests** that may now fail due to the perspective change.

### 1B. Death via Draw — Immediate Game End

**Bug:** Drawing Death from the Major Arcana draw pile (via buy at cost 6, or Wheel of Fortune) silently puts Death into the player's hand. It should reveal Death and end the game immediately.

**Rule:** Death ends the game whenever it is acquired by any means. Drawing is private for normal cards, but Death is the exception — it must always be revealed.

**Fix in `src/engine.js`:**

In `resolveWheelOfFortuneGen`, after `card = drawMajorCard(state)` in the `src.source === 'draw'` branch:
```javascript
if (src.source === 'draw') {
  card = drawMajorCard(state);
  if (card && isDeathCard(state, card)) {
    state.gameEnded = true;
    state.gameEndReason = 'death_revealed';
    log(state, `Death drawn from Major deck! Game ends!`);
    return; // Abort Wheel action entirely — no keep/pit choice
  }
}
```

In `executeBuy`, after `bought = drawMajorCard(state)` in the `source === 'draw'` branch — Death is already checked later in the function via the `isDeathCard(state, bought)` check. Verify that code path works and the game ends before Death enters the player's hand.

**Tests:**
- Wheel of Fortune drawing Death from deck ends game immediately
- Wheel drawing Death as first card aborts before second draw
- Buy from draw pile getting Death ends game
- Death does NOT go into any player's hand
- Wheel taking from Display that refills with Death also ends game (verify existing `checkDeathInDisplay` works)

### 1C. The Hermit — Owner Chooses Which Tome Cards to Take

**Bug:** The Hermit's on-play effect in `src/effect-resolver.js` case `TOME_CARDS_TO_HAND` takes ALL other Tome cards automatically. The owner should choose which ones (none, some, or all).

**Fix:**

1. Add `HERMIT_CHOOSE: 'HERMIT_CHOOSE'` to `DECISION_TYPES` in `src/history.js`
2. Add `chooseHermitCards(state, playerIndex)` to `RandomAI` in `src/ai/base.js` — returns array of Tome indices to take (random subset). Other AIs can inherit or override.
3. Change `resolveTomeOnPlayGen` in `src/effect-resolver.js` — the `TOME_CARDS_TO_HAND` case must become a generator that yields `HERMIT_CHOOSE`. Since `resolveTomeOnPlayGen` is already a generator, this works naturally.
4. Add handling for `HERMIT_CHOOSE` in `resolveWithAI` in `src/scoring.js`
5. Add handling in `src/history.js` replay helpers
6. Add handling in `GameController` for human players (game client)

**Tests:**
- Owner chooses none → all other Tome cards remain
- Owner chooses one → that card moves to hand, others stay
- Owner chooses all → all move to hand, Hermit alone in Tome
- Taking a protection card removes that suit's protection
- Hermit alone in Tome (no other cards) → no decision yielded, Hermit scores 1VP

### 1D. Display Pricing — Invert Slot Prices

**Bug:** `display0` (where new cards appear) costs 7 but should cost 9. `display2` (oldest, about to age off) costs 9 but should cost 7. Cards get CHEAPER as they age, not more expensive.

Correct pricing: draw=6, display0(newest)=9, display1(middle)=8, display2(oldest)=7, discard=10.

**Fix:**
1. In `src/config-core.js`, change `buyPrices`: `display0: 9, display1: 8, display2: 7`
2. In `data/cards.json`, same change
3. In `src/actions.js`, change the fallback in `addBuyActions`: `buyPrices[\`display\${i}\`] ?? (9 - i)` (was `7 + i`)

**Tests:**
- Config has display0=9, display2=7
- Buy action for newest slot requires payment >= 9
- Buy action for oldest slot requires payment >= 7
- A hand with total value 8 can buy from display2 (cost 7) but NOT display0 (cost 9)

### 1E. Tower — Player Chooses Which Card to Destroy

**Bug:** Tower auto-destroys the last card in each qualifying Tome. The Tower player should choose.

**Fix:**
1. Add `TOWER_CHOOSE: 'TOWER_CHOOSE'` to `DECISION_TYPES` in `src/history.js`
2. Add `chooseTowerTarget(state, playerIndex, targetPlayerIndex, tomeCards)` to `RandomAI` — returns index into the target's Tome. Smart AIs should prefer celestials > protection cards > other.
3. Change `resolveTower` in `src/engine.js` from synchronous to a generator `resolveTowerGen` that yields `TOWER_CHOOSE` for each qualifying opponent Tome
4. Update `executeMajorActionGen` to use `yield*` for Tower (was synchronous call)
5. Add handling in `resolveWithAI`, history replay, and `GameController`

**Tests:**
- Tower player can target any card in a qualifying Tome
- Tower skips Tomes of equal or smaller size
- Destroying a protection card removes that protection
- Destroying a celestial removes it (important strategic test)

### Phase 1 Commit
`fix: Fool perspective, Death on draw, Hermit choice, display pricing, Tower choice`

---

## Phase 2: New Features (4 features)

### 2A. Major Arcana as Payment

**Rule:** Players may spend Royal cards (Page=11, Knight=12, Queen=13, King=14) or Major Arcana from hand (value = card number) as payment when buying.

**Check:** `findPayments` in `src/actions.js` already operates on the full `player.hand` and uses `c.purchaseValue`. Major Arcana cards have `purchaseValue = number`. So this may already work. **Verify:**

1. Run a test: put The World (purchaseValue=21) in a player's hand and check that `getLegalActions` includes buy actions using The World as payment
2. If it works, write tests confirming it. If it doesn't, fix `findPayments` to include Major Arcana
3. Verify payment cards go to `minorDiscard` not Pit (per rules: "cards are discarded to the Minor Discard Pile even if discarding a Major Arcana card")
4. The Fool (purchaseValue=0) should be useless as sole payment
5. Payment descriptions should mention the Major Arcana card name

**Tests:**
- The World (21) can buy from any source as single payment
- The Fool (0) cannot buy anything alone
- King (14) can buy from discard (cost 10) 
- Mixed: Major Arcana + Minor card as payment
- Payment cards go to minorDiscard
- Buy actions appear in getLegalActions when only Major Arcana in hand

### 2B. Ace High Variant

**Rule:** Config flag `gameRules.aceHigh`, default `true`. When on, Ace ranks as 15 (above King's 14) in poker hand evaluation ONLY. Purchase value stays at 1. `numericRank` on the card object stays 1.

**Implementation:**

1. Add `aceHigh: true` to `gameRules` in `src/config-core.js` and `data/cards.json`
2. Add optional `options` parameter to `evaluateHand(cards, options = {})` in `src/poker.js`
3. When `options.aceHigh` is true, remap Ace from rank 1 to rank 15 before evaluation
4. Update `checkStraight` — with aceHigh, valid straights are 2-6 through 11-15 (Page through Ace). A-2-3-4-5 is NOT a straight when aceHigh is true.
5. Update all call sites for `evaluateHand` across the codebase to pass `{ aceHigh: state.config?.gameRules?.aceHigh ?? true }`. Search for `evaluateHand(` across all files including `src/scoring.js`, `src/ai/*.js`, `src/actions.js`, `src/poker.js` (internal calls), and `src/card-balance.js`.
6. Wild card candidate generation in `generateCandidates` must also respect aceHigh.
7. The `options` parameter must be optional — existing calls without it default to `aceHigh: false` to not break existing tests. BUT the default config has `aceHigh: true`, so calls that pass the config will get aceHigh behavior.

**Tests:**
- aceHigh=true: pair of Aces beats pair of Kings
- aceHigh=true: highest straight is Page-Knight-Queen-King-Ace
- aceHigh=true: A-2-3-4-5 is NOT a straight
- aceHigh=false: pair of Kings beats pair of Aces (backward compatible)
- aceHigh=true: Ace purchase value remains 1
- aceHigh with wild: wild becomes Ace when that's strongest
- All 44 existing poker tests pass unchanged (they don't pass options, so default to aceHigh=false)

### 2C. Charity Variant

**Rule:** Config flag `gameRules.charityEnabled`, default `true`. At round end, any player who scored ZERO points that round (no pot win, no bonus VP) may carry ONE card from hand into the next round. That card must be discarded during their first discard phase (which happens naturally since hand limit is 6 and they'd have 7).

**Implementation:**

1. Add `charityEnabled: true` to `gameRules` in config
2. Track per-round VP delta for each player (VP before round scoring vs after)
3. In `handleRoundEndGen` or `resetForNextRound`, before clearing hands:
   - If charityEnabled, identify players with 0 VP gained this round
   - For each, yield a `CHARITY_CHOOSE` decision — pick 1 card from hand to keep, or -1 for none
   - Keep that card while clearing the rest
4. Add `CHARITY_CHOOSE` to decision types, add `chooseCharityCard` to RandomAI
5. Since `resetForNextRound` is currently synchronous, it needs to become a generator (or the charity logic goes in `handleRoundEndGen` before the reset call)

**Tests:**
- Player who scored 0 keeps 1 card, has 7 after deal
- Player who scored VP does NOT get charity
- charityEnabled=false: no charity for anyone
- Player can choose not to keep any card (return -1)

### 2D. Variant Toggle Stubs

Add config flags with defaults. Full implementation deferred — just the config keys, editor UI toggles, and basic tests.

```javascript
gameRules: {
  aceHigh: true,              // Phase 2B (fully implement)
  charityEnabled: true,       // Phase 2C (fully implement)
  twoPlayerVariant: false,    // Stub only
  extendedArcana: false,      // Stub only
  vaultEnabled: false,        // Stub only
}
```

Add checkboxes and tooltips in `editor/src/components/GameRulesEditor.jsx`:
- "Ace High" — tooltip: "Aces rank above Kings in poker evaluation. Purchase value stays at 1."
- "Charity" — tooltip: "Players scoring 0 points in a round carry one card to the next round."
- "Two-Player Variant" — tooltip: "Removes cards 2-6, modifies hand rankings. Not yet implemented in simulation."
- "Extended Arcana" — tooltip: "Cards 22-26 added, 5 random removed. Not yet implemented in simulation."
- "Vault" — tooltip: "Winners keep Realm as Vault. Not yet implemented in simulation."

Add tooltip text to `editor/src/utils/tooltips.js`. Add fields to schema in `editor/src/utils/schema.js`.

### Phase 2 Commit
`feat: Major Arcana payment, Ace High, Charity variant, variant toggle stubs`

---

## Phase 3: Config-Aware AI

### 3A. Create Card Valuation Utility

Create `src/ai/card-value.js` with:

```javascript
export function estimateCardValue(state, playerIndex, card, context)
```

This reads the card's effect config from `state.config.majorArcana` via `getCardEffect(state, card)` and estimates strategic value based on:

- **Bonus cards:** expected VP = configured VP × likelihood of meeting conditions (check player's current Realm for suits/pairs). If `vpPerPair` is 1000, the value should be ~1000× higher than default.
- **Action cards:** value based on board state (e.g., Chariot high if celestials visible, Tower high if opponents have large Tomes)
- **Celestials:** `vpAtGameEnd × 5` base + massive bonus if player already has 2 celestials (third = instant win)
- **Tome on-play:** protection cards valued by how many of that suit are in Realm; Devil always good for card advantage
- **Context modifiers:** 'tome' = full value; 'buy' = discounted; 'discard' = inverted (high value = keep); 'wild' = ignore bonus potential

The function must be **pure, fast, and scale with config values.**

### 3B. Wire All AIs

Replace hardcoded static scores in every AI file with calls to `estimateCardValue`. The pattern:

```javascript
// OLD
case 'PLAY_MAJOR_TOME': {
  if (isCelestial(action.card)) return 40;
  if (action.card.number === 15) return 35;
  if (action.card.category === 'bonus-round') return 20;
  return 15;
}

// NEW  
case 'PLAY_MAJOR_TOME': {
  let val = estimateCardValue(state, playerIndex, action.card, 'tome');
  // Personality modifier (e.g., CelestialAI boosts celestials)
  if (isCelestial(action.card)) val *= 3;
  return val;
}
```

Do this for PLAY_MAJOR_TOME, BUY (evaluating display cards), DISCARD (keeping valuable cards), and chooseMajorKeep (setup) across all 10 AI files.

Preserve AI personality through multipliers on top of the base valuation.

Also update `findCelestialDisruption` in `awareness.js` to use effect-based checks instead of card numbers.

### 3C. Tests

- AI plays Lovers to Tome MORE often when vpPerPair=500 vs default (same seed, different config → different decisions)
- AI uses Lovers as wild LESS when vpPerPair=500
- Custom card with vp=50 is valued higher than default vp=1 card
- Third celestial valued enormously higher than first
- AI personality preserved (CelestialAI still prefers celestials)

### Phase 3 Commit
`feat: config-aware AI card valuation — AIs respond to card balance changes`

---

## Phase 4: Stats Fix & Tooltip Fix

### 4A. Stats Name-Matching Bug

**Bug:** In `src/stats.js` line ~299, winner-tome presence is counted by matching `tomeCard` names against `cardStats` names. These use inconsistent formats (some have parenthetical numbers, some don't), causing ~half the cards to get `inWinnerTome = 0`, corrupting power rankings.

**Fix:** Already applied locally but not committed. The fix in `computeCardAnalytics`:
```javascript
const entry = Object.values(cards).find(c => 
  c.name === name || c.name.replace(/ \(\d+\)$/, '') === name
);
```

Also consider fixing the root cause: make `tomeCards` in `src/simulation.js` line 110 store `cardName(c)` instead of `c.name` for consistency. Or store card numbers instead of names.

### 4B. Tooltip Clipping Fix

**Bug:** Tooltips near the left edge of the editor's right panel get clipped by `overflow-hidden` on the parent `<main>` element.

**Fix:** Replace the pure-CSS tooltip in `editor/src/components/Tooltip.jsx` with the JS-positioned version using `getBoundingClientRect` and `position: fixed`:

```jsx
import React, { useState, useRef, useCallback } from 'react';

export default function Tooltip({ text }) {
  if (!text) return null;
  const iconRef = useRef(null);
  const [style, setStyle] = useState({});
  const [visible, setVisible] = useState(false);

  const show = useCallback(() => {
    if (!iconRef.current) return;
    const rect = iconRef.current.getBoundingClientRect();
    let left = rect.left;
    let top = rect.top - 6;
    const maxLeft = window.innerWidth - 320;
    if (left > maxLeft) left = maxLeft;
    if (left < 8) left = 8;
    setStyle({ left: `${left}px`, top: `${top}px`, transform: 'translateY(-100%)' });
    setVisible(true);
  }, []);

  const hide = useCallback(() => setVisible(false), []);

  return (
    <span className="tooltip-wrap" onMouseEnter={show} onMouseLeave={hide}>
      <span className="tooltip-icon" ref={iconRef}>?</span>
      {visible && (
        <span className="tooltip-text" style={{ ...style, visibility: 'visible', opacity: 1 }}>
          {text}
        </span>
      )}
    </span>
  );
}
```

Update CSS in `editor/index.html` — the `.tooltip-text` class should use `position: fixed` and remove the hover rule (visibility is now controlled by React state).

### Phase 4 Commit
`fix: stats name-matching for power rankings, tooltip overflow clipping`

---

## Final Verification

After all 4 phases:

1. `npx vitest run` — all tests pass (should be 320+)
2. `node index.js --games 500 --players 4 --seed 42 --report` — verify:
   - Display pricing shows newest=9, oldest=7
   - All 4 celestials have similar power rankings
   - Fool success rate is lower than before (harder to score from owner's perspective)
   - Ace High: pairs of Aces beat pairs of Kings in results
3. Config change test: modify Lovers vpPerPair to 500, run simulation — AIs should now pursue Lovers more aggressively, it should appear in more winning Tomes
4. Editor: open Game Rules tab — all 5 variant toggles visible with tooltips
5. Editor: change a bonus VP, switch to Simulate tab, run — reports reflect the change
