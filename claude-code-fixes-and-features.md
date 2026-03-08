# Claude Code Prompt: Fix Bugs & Implement Features from Designer Review

## Context

The game designer (Danny) reviewed 16 questions about rules ambiguities. This prompt fixes the 5 confirmed bugs, implements the 6 missing features, and adds thorough tests for each. The changes are ordered: engine bugs first, then new features that build on the corrected engine.

There are 6 phases. Run `npx vitest run` after each phase. Do not proceed until all tests pass.

---

## Phase 1: Fix The Fool (evaluate from owner's perspective)

### Bug

In `src/scoring.js`, `resolveFoolGen` evaluates duplicated bonuses from the **opponent's** perspective (`resolveBonusGen(state, pi, card)` where `pi` is the opponent). It should evaluate from the **Fool owner's** perspective (`resolveBonusGen(state, playerIndex, card)` where `playerIndex` is the Fool's owner).

The Fool copies the card's rules into the owner's context. The owner's Realm is checked against the bonus requirements, and the owner makes any decisions (e.g., choosing the Magician's suit).

### Fix

In `src/scoring.js`, change `resolveFoolGen`:

```javascript
function* resolveFoolGen(state, playerIndex) {
  let bestBonus = 0;

  for (let pi = 0; pi < state.players.length; pi++) {
    if (pi === playerIndex) continue;
    // Owner must have cards in realm to score (standard bonus rule)
    if (state.players[playerIndex].realm.length === 0) continue;

    for (const card of state.players[pi].tome) {
      if (!isBonusCard(card)) continue;
      // Evaluate from the FOOL OWNER's perspective — check owner's Realm
      const bonusVp = yield* resolveBonusGen(state, playerIndex, card);
      if (bonusVp > bestBonus) {
        bestBonus = bonusVp;
      }
    }
  }

  return bestBonus;
}
```

Note the two changes:
1. `resolveBonusGen(state, playerIndex, card)` — `playerIndex` instead of `pi`
2. Check `state.players[playerIndex].realm.length === 0` (the Fool owner's realm), not the opponent's

This also means when the Fool duplicates a Magician, the MAGICIAN_SUIT yield goes to the Fool owner (playerIndex), who chooses which suit. This is correct because `resolveMagicianGen` uses the `playerIndex` it receives.

### Tests

Add to `test/card-comprehensive.test.js`:

```javascript
describe('Card 0 — The Fool (fixed)', () => {
  it('evaluates from Fool OWNER perspective, not opponent', () => {
    // Setup: Opponent has Justice (most Swords) with 3 Swords
    // Fool owner has 0 Swords
    // Fool should NOT score because OWNER doesn't have most Swords
    const state = makeState(2);
    state.players[0].tome.push(major(0)); // Fool owner
    state.players[0].realm.push(mc('CUPS', 5), mc('CUPS', 8)); // No swords
    state.players[1].tome.push(major(11)); // Justice (swords bonus)
    state.players[1].realm.push(mc('SWORDS', 3), mc('SWORDS', 9));
    
    const vp = resolveBonus(state, 0, state.players[0].tome[0], makeAIs(2));
    expect(vp).toBe(0); // Owner doesn't meet the requirement
  });

  it('scores when Fool OWNER meets the duplicated requirement', () => {
    // Fool owner has most Swords AND opponent has Justice
    const state = makeState(2);
    state.players[0].tome.push(major(0));
    state.players[0].realm.push(mc('SWORDS', 5), mc('SWORDS', 8), mc('SWORDS', 10));
    state.players[1].tome.push(major(11)); // Justice
    state.players[1].realm.push(mc('SWORDS', 3));
    
    const vp = resolveBonus(state, 0, state.players[0].tome[0], makeAIs(2));
    expect(vp).toBe(1); // Owner has most Swords
  });

  it('returns 0 when Fool owner has no realm cards', () => {
    const state = makeState(2);
    state.players[0].tome.push(major(0));
    state.players[0].realm = []; // Empty realm
    state.players[1].tome.push(major(11));
    state.players[1].realm.push(mc('SWORDS', 5));
    
    const vp = resolveBonus(state, 0, state.players[0].tome[0], makeAIs(2));
    expect(vp).toBe(0);
  });

  it('duplicating Magician: Fool owner chooses suit', () => {
    // Fool owner has 3 CUPS, opponent has Magician in tome
    // Using FixedSuitAI that always picks CUPS
    const state = makeState(2);
    state.players[0].tome.push(major(0));
    state.players[0].realm.push(mc('CUPS', 5), mc('CUPS', 8), mc('CUPS', 10));
    state.players[1].tome.push(major(1)); // Magician
    state.players[1].realm.push(mc('CUPS', 3)); // Opponent has fewer CUPS
    
    const vp = resolveBonus(state, 0, state.players[0].tome[0], makeAIsWithSuit(2, 'CUPS'));
    expect(vp).toBe(1); // Owner has strictly more CUPS
  });
});
```

### Commit

`fix: The Fool evaluates from owner's perspective, owner chooses Magician suit`

---

## Phase 2: Fix Death Handling (drawing Death ends game)

### Bug

When a player draws Death from the Major Arcana draw pile (via buy at cost 6, or Wheel of Fortune drawing from deck), Death goes silently into the player's hand. It should be revealed and the game should end immediately.

### Fix

**2.1** In `src/engine.js`, in `executeBuy`, after drawing from the draw pile, check for Death:

Find the section handling `source === 'draw'`:
```javascript
if (source === 'draw') {
  bought = drawMajorCard(state);
}
```

After drawing, immediately check: if the drawn card is Death, end the game before it goes to hand.

**2.2** In `src/engine.js`, in `resolveWheelOfFortuneGen`, after drawing from the deck (`src.source === 'draw'`), check for Death. If Death is drawn, the game ends immediately — the player does NOT get to keep/pit any cards. The Wheel action is interrupted.

```javascript
for (const src of sources) {
  let card = null;
  if (src.source === 'draw') {
    card = drawMajorCard(state);
    // Death drawn from deck — must reveal, game ends immediately
    if (card && isDeathCard(state, card)) {
      state.gameEnded = true;
      state.gameEndReason = 'death_revealed';
      log(state, `Death drawn from Major deck via Wheel of Fortune! Game ends!`);
      return; // Abort Wheel action entirely
    }
  } else if (src.source === 'display') {
    // ... existing display code with refill + Death check
  }
  // ... rest
}
```

**2.3** Also check in the Display refill path — when Wheel takes from the Display and the refill reveals Death. This is already handled by `checkDeathInDisplay(state)` after refill. Verify it works.

**2.4** Check all other paths where `drawMajorCard(state)` is called and add Death checks:
- `setupGen` — Death should be in the bottom 3, so this shouldn't happen, but add a safety check
- `refillDisplay` — already checked via `checkDeathInDisplay`
- `resolveChariotGen` — if Chariot takes from Display, refill may reveal Death (already handled)

### Tests

```javascript
describe('Death via draw (fixed)', () => {
  it('buying from draw pile and getting Death ends game', () => {
    const state = makeState(2);
    const death = major(13);
    state.majorDeck = [death]; // Death is the only card in deck
    state.players[0].hand.push(mc('WANDS', 'KING')); // Payment (14 >= 6)
    
    // Execute a buy from draw
    // ... setup the action and call executeBuy or executeActionGen
    // After execution, state.gameEnded should be true
    // state.gameEndReason should be 'death_revealed' or 'death_purchased'
  });

  it('Wheel of Fortune drawing Death ends game immediately', () => {
    const state = makeState(2);
    const death = major(13);
    state.majorDeck = [death]; // Death is on top
    // Run Wheel of Fortune choosing 'draw' as a source
    // Game should end, player should NOT get to keep/pit
  });

  it('Wheel of Fortune drawing Death as first card aborts before second draw', () => {
    const state = makeState(2);
    const death = major(13);
    const star = major(17);
    state.majorDeck = [star, death]; // Death on top, Star below
    // Wheel chooses draw, draw — Death is first card
    // Game ends. Star is NOT drawn. Player gets nothing.
  });

  it('Wheel of Fortune taking from Display that refills with Death ends game', () => {
    const state = makeState(2);
    const death = major(13);
    state.display = [major(17), major(18), major(19)];
    state.majorDeck = [death]; // Death will appear when display refills
    // Wheel takes from display slot 0
    // Refill draws Death into display → game ends
  });

  it('Death drawn from deck during buy does not go to player hand', () => {
    // After Death is drawn and game ends, Death should NOT be in any player's hand
  });
});
```

### Commit

`fix: drawing Death from deck reveals it and ends game immediately`

---

## Phase 3: Fix Hermit (owner chooses which cards to take)

### Bug

The Hermit's on-play effect in `src/effect-resolver.js` `resolveTomeOnPlayGen` case `TOME_CARDS_TO_HAND` takes ALL other Tome cards automatically. The owner should choose which ones (none, some, or all).

### Fix

**3.1** Add a new decision type `HERMIT_CHOOSE` to `DECISION_TYPES` in `src/history.js`.

**3.2** Add a new AI method `chooseHermitCards(state, playerIndex)` to `RandomAI` in `src/ai/base.js`. It should return an array of indices into `player.tome` (excluding the Hermit itself) indicating which cards to take. RandomAI can randomly choose a subset.

**3.3** Change `resolveTomeOnPlayGen` in `src/effect-resolver.js` to yield a `HERMIT_CHOOSE` decision instead of automatically taking all cards:

```javascript
case 'TOME_CARDS_TO_HAND': {
  // Get indices of all non-Hermit cards in Tome
  const eligibleIndices = [];
  for (let i = 0; i < player.tome.length; i++) {
    if (player.tome[i].id !== card.id) eligibleIndices.push(i);
  }
  
  if (eligibleIndices.length === 0) break;
  
  // Yield decision: which cards to take?
  const chosenIndices = yield {
    type: 'HERMIT_CHOOSE',
    playerIndex,
    eligibleIndices,
    state,
  };
  recordDecision(state, 'HERMIT_CHOOSE', playerIndex, chosenIndices);
  
  // Take chosen cards (process in reverse index order to avoid shifting)
  const sorted = [...(chosenIndices || [])].sort((a, b) => b - a);
  for (const idx of sorted) {
    if (idx >= 0 && idx < player.tome.length && player.tome[idx].id !== card.id) {
      const tc = player.tome.splice(idx, 1)[0];
      player.hand.push(tc);
      const protSuit = getProtectionSuit(state, tc.number);
      if (protSuit) player.tomeProtections.delete(protSuit);
    }
  }
  if (sorted.length > 0) {
    log(state, `${player.name} takes ${sorted.length} Tome card(s) into hand via Hermit`);
  }
  break;
}
```

**3.4** Update `resolveWithAI` in `src/scoring.js` to handle the new `HERMIT_CHOOSE` decision type by calling `ai.chooseHermitCards(state, playerIndex)`.

**3.5** Update all AI subclasses that override Hermit behavior. Most can inherit from RandomAI's default.

**3.6** Update the `GameController` and `useGameController` to handle `HERMIT_CHOOSE` for human players (the game client needs to present the choice).

### Tests

```javascript
describe('Card 9 — Hermit choice (fixed)', () => {
  it('owner can choose to take no cards', () => {
    // Hermit + 2 other cards in Tome, AI returns [] (take nothing)
    // Both other cards remain in Tome
  });

  it('owner can choose to take some cards', () => {
    // Hermit + 2 other cards, AI returns [0] (take first only)
    // One card moves to hand, one stays in Tome
  });

  it('owner can choose to take all cards', () => {
    // Hermit + 2 other cards, AI returns [0, 1]
    // Both move to hand, Hermit alone in Tome
  });

  it('taking a protection card removes protection', () => {
    // Hermit + Temperance in Tome, player takes Temperance
    // CUPS protection should be removed
  });

  it('choosing none leaves Tome unchanged', () => {
    // Verify Tome is exactly the same after choosing []
  });
});
```

### Commit

`fix: Hermit lets owner choose which Tome cards to take`

---

## Phase 4: Fix Display Pricing and Tower Choice

### 4A: Display Pricing Bug

The buy prices in `data/cards.json` and `src/config-core.js` are inverted. Currently: `display0: 7, display1: 8, display2: 9` where display0 is the slot new cards enter (should be most expensive).

Correct pricing:
- `display0` (newest slot, where fresh cards appear) = **9**
- `display1` (middle slot) = **8**  
- `display2` (oldest slot, about to age off) = **7**

**Fix:** Change in both `data/cards.json` and `src/config-core.js`:

```javascript
buyPrices: {
  draw: 6,
  display0: 9,    // was 7 — newest/most expensive
  display1: 8,    // unchanged
  display2: 7,    // was 9 — oldest/cheapest
  discard: 10,
},
```

Also update `addBuyActions` in `src/actions.js` — check the fallback values: `buyPrices[`display${i}`] ?? (7 + i)`. This fallback produces 7, 8, 9 which is wrong. Change to `buyPrices[`display${i}`] ?? (9 - i)` so the fallback matches the correct pricing.

### 4B: Tower Player Choice Bug

The Tower currently auto-destroys the last card in each qualifying Tome. The Tower player should choose which card to destroy from each qualifying Tome.

**Fix:** Add a new decision type `TOWER_CHOOSE` to `DECISION_TYPES`.

Add `chooseTowerTarget(state, playerIndex, targetPlayerIndex)` to `RandomAI` — returns an index into the target's Tome.

Change `resolveTower` in `src/engine.js` (and `src/effects.js`) from synchronous to a generator that yields `TOWER_CHOOSE` for each qualifying opponent's Tome. The Tower player picks which card to destroy.

Also update AI subclasses — smart AIs should target celestials or protection cards preferentially.

### Tests

```javascript
describe('Display pricing (fixed)', () => {
  it('newest display slot costs 9', () => {
    const state = makeState(4);
    const config = state.config;
    expect(config.buyPrices.display0).toBe(9);
  });

  it('oldest display slot costs 7', () => {
    const state = makeState(4);
    expect(state.config.buyPrices.display2).toBe(7);
  });

  it('buy actions reflect correct pricing', () => {
    // Create state with cards in display and hand with value 7-8
    // Verify player CAN buy from oldest slot (cost 7) with 7-value payment
    // Verify player CANNOT buy from newest slot (cost 9) with 7-value payment
  });
});

describe('Tower player choice (fixed)', () => {
  it('Tower player chooses which card to destroy', () => {
    // Opponent has [Celestial, Protection, Bonus] in Tome
    // Tower player should be able to target any of the 3
  });

  it('Tower player can target celestial in opponent Tome', () => {
    // Strategic test: Tower destroys opponent's celestial
  });

  it('Tower player can target protection card', () => {
    // Remove a protection card → opponent's suit becomes vulnerable
  });

  it('Tower does not target Tomes of equal or smaller size', () => {
    // Verify Tower skips Tomes that aren't larger
  });
});
```

### Commit

`fix: correct display pricing (newest=9, oldest=7) and Tower player chooses target`

---

## Phase 5: Implement New Features

### 5A: Major Arcana as Payment

The rules allow Major Arcana and Royal cards from hand as payment when buying. The engine's `findPayments` in `src/actions.js` already operates on the full hand and uses `purchaseValue`, so it technically already includes Major Arcana cards. But verify this works correctly:

1. Major Arcana `purchaseValue` = their number (The Fool = 0, The World = 21). **Verify** these are correct.
2. Royal card `purchaseValue` = Page 11, Knight 12, Queen 13, King 14. **Verify** these are correct.
3. `findPayments` should already produce valid combinations including Major Arcana. **Test this explicitly.**
4. When a Major Arcana is used as payment, it goes to the **Minor Arcana discard pile** (per RULES.md: "Note that cards are discarded to the Minor Discard Pile even if discarding a Major Arcana card"). **Verify** `executeBuy` puts payment cards in `minorDiscard`.
5. The Fool (purchaseValue 0) is worthless as payment. **Test this.**

If `findPayments` already handles this, the main work is testing and potentially expanding the action descriptions to mention Major Arcana payment.

### Tests

```javascript
describe('Major Arcana as payment', () => {
  it('The World (21) can buy any card as single payment', () => {
    // World purchaseValue=21, highest price is discard=10
    // A single World should be valid payment for any source
  });

  it('The Fool (0) is worthless as payment', () => {
    // Fool purchaseValue=0, can't meet any price alone
    // Fool + high minor might work
  });

  it('Royal cards as payment — King (14) buys from discard (10)', () => {
    // King purchaseValue=14 >= 10
  });

  it('mixed payment: Major Arcana + Minor Arcana', () => {
    // E.g., Hermit (9) + 2-value minor = 11, enough for display0 (9)
  });

  it('payment cards go to Minor Arcana discard pile, not Pit', () => {
    // After buying with Major Arcana, check minorDiscard contains the Major
  });

  it('Major Arcana payment appears in buy action descriptions', () => {
    // getLegalActions should include buy options using Major Arcana from hand
  });
});
```

### 5B: Ace High Variant

Add `gameRules.aceHigh` config flag (default: `true`).

When `aceHigh` is true:
- Ace evaluates as rank **15** (above King's 14) in poker hand evaluation only
- Highest straight: Page, Knight, Queen, King, Ace (11-12-13-14-15)
- Lowest straight: 2, 3, 4, 5, 6 (Ace-2-3-4-5 is no longer valid)
- Ace purchase value remains **1** — `purchaseValue` is unchanged
- `numericRank` on the card object should remain 1 — the poker evaluator reads the config flag and treats Ace as 15 during evaluation only

**Implementation:**

In `src/poker.js`, `evaluateNormalHand` needs to check for `aceHigh` in the cards' config context. However, `evaluateHand` doesn't receive `state` — it just gets an array of cards. 

Options:
1. Pass a config/options object to `evaluateHand`: `evaluateHand(cards, { aceHigh: true })`
2. Use a module-level flag that's set before simulation runs

Option 1 is cleaner. Add an optional second parameter:

```javascript
export function evaluateHand(cards, options = {}) {
  // ... existing code
  // In evaluateNormalHand, if options.aceHigh, map Ace rank from 1 to 15
}
```

Update ALL call sites for `evaluateHand` across the codebase (scoring, AI files, actions) to pass the option from state config:

```javascript
const aceHigh = state.config?.gameRules?.aceHigh ?? false;
evaluateHand(player.realm, { aceHigh });
```

**Important:** The `checkStraight` function needs to handle both modes. In Ace High, the valid straights are 2-3-4-5-6 through 11-12-13-14-15 (Page through Ace). In Ace Low (default off), they're 1-2-3-4-5 through 10-11-12-13-14.

**Wild card evaluation** must also respect aceHigh — when generating candidates, Ace should be rank 15 if aceHigh is on.

### Tests

```javascript
describe('Ace High variant', () => {
  it('aceHigh=true: pair of Aces beats pair of Kings', () => {
    const hand1 = [mc('WANDS', 'ACE'), mc('CUPS', 'ACE')];
    const hand2 = [mc('WANDS', 'KING'), mc('CUPS', 'KING')];
    const e1 = evaluateHand(hand1, { aceHigh: true });
    const e2 = evaluateHand(hand2, { aceHigh: true });
    expect(compareHands(e1, e2)).toBeGreaterThan(0);
  });

  it('aceHigh=true: highest straight is P,Kn,Q,K,A', () => {
    const hand = [mc('WANDS', 'PAGE'), mc('CUPS', 'KNIGHT'), mc('SWORDS', 'QUEEN'), mc('COINS', 'KING'), mc('WANDS', 'ACE')];
    const e = evaluateHand(hand, { aceHigh: true });
    expect(e.rank).toBe(4); // Straight
    expect(e.tiebreakers[0]).toBe(15); // Ace high
  });

  it('aceHigh=true: A,2,3,4,5 is NOT a straight', () => {
    const hand = [mc('WANDS', 'ACE'), mc('CUPS', 2), mc('SWORDS', 3), mc('COINS', 4), mc('WANDS', 5)];
    const e = evaluateHand(hand, { aceHigh: true });
    expect(e.rank).toBe(0); // High card, not straight
  });

  it('aceHigh=false (default off): pair of Kings beats pair of Aces', () => {
    const hand1 = [mc('WANDS', 'KING'), mc('CUPS', 'KING')];
    const hand2 = [mc('WANDS', 'ACE'), mc('CUPS', 'ACE')];
    const e1 = evaluateHand(hand1, { aceHigh: false });
    const e2 = evaluateHand(hand2, { aceHigh: false });
    expect(compareHands(e1, e2)).toBeGreaterThan(0);
  });

  it('aceHigh=true: Ace purchase value remains 1', () => {
    const ace = mc('WANDS', 'ACE');
    expect(ace.purchaseValue).toBe(1);
  });

  it('aceHigh with wild card: wild becomes Ace for strongest hand', () => {
    // 4 Kings + wild → five-of-a-kind of Aces (rank 15 > 14)
    const hand = [mc('WANDS', 'KING'), mc('CUPS', 'KING'), mc('SWORDS', 'KING'), mc('COINS', 'KING'), wild(17)];
    const e = evaluateHand(hand, { aceHigh: true });
    expect(e.rank).toBe(9); // Five-of-a-kind
    expect(e.tiebreakers[0]).toBe(15); // Aces (highest)
  });

  it('existing poker tests still pass with aceHigh=false', () => {
    // The existing 44 poker tests use the default (no options), which should be aceHigh=false
    // Verify no regressions
  });
});
```

### 5C: Charity Variant

Add `gameRules.charityEnabled` config flag (default: `true`).

When enabled: at the end of a round, any player who scored **zero points** that round (no pot win, no bonus VP) may carry **one card** from their hand into the next round. This card persists through the reset but must be discarded during their first discard phase of the new round.

**Implementation:**

In `resetForNextRound` in `src/engine.js`:
1. Before gathering hand cards, check `state.config.gameRules.charityEnabled`
2. For each player, check if they scored 0 VP this round (need to track per-round VP delta)
3. If eligible, yield a `CHARITY_CHOOSE` decision — the player picks 1 card from hand (or none)
4. That card stays in hand while the rest are gathered

OR, since `resetForNextRound` is synchronous and doesn't yield, this needs restructuring. The simplest approach: track which players scored zero, then after the deal for the next round, give those players the extra card (conceptually they "carried it"). This avoids changing the generator structure.

Add `chooseCharityCard(state, playerIndex)` to `RandomAI` — returns the index of the hand card to keep, or -1 for none.

### Tests

```javascript
describe('Charity variant', () => {
  it('charityEnabled=true: player who scored 0 keeps one card', () => {
    // Simulate a round where player scores 0
    // After round reset, player should have 7 cards (6 dealt + 1 carried)
  });

  it('charityEnabled=true: player who scored VP does not get charity', () => {
    // Player won pot → no charity
  });

  it('charityEnabled=false: no one gets charity', () => {
    // Toggle off → even zero-scoring players lose all hand cards
  });

  it('charity card must be discarded in first discard phase', () => {
    // After dealing, player with 7 cards discards to 6 in discard phase
    // This happens naturally since hand limit is 6
  });
});
```

### 5D: Variant Toggles (Two-Player, Extended Arcana, Vault)

Add the following config flags with defaults:

```javascript
gameRules: {
  // ... existing
  aceHigh: true,           // NEW — Ace ranks above King in hand eval
  charityEnabled: true,    // NEW — zero-score players carry 1 card
  twoPlayerVariant: false, // NEW — reduced deck, modified rankings
  extendedArcana: false,   // NEW — cards 22-26 shuffled in, 5 removed
  vaultEnabled: false,     // NEW — winners keep Realm as Vault
}
```

**Two-Player Variant** (default off): When enabled with 2 players:
- Remove all Minor Arcana with values 2-6
- Lowest straight becomes 7, 8, 9, 10, Page
- Hand rankings reorder: Flush beats Full House (Flush is harder with fewer cards)
- Recommend playing with aceHigh

**Extended Arcana** (default off): When enabled with 2-5 players:
- Shuffle all 26 Major Arcana into the deck
- Randomly remove 5 face-down (unknown) before play begins
- This means Death might be removed, so add a "deck exhaustion" game-end condition

**Vault** (default off): When enabled:
- First time a player wins a round, their winning Realm becomes their Vault (set aside)
- Subsequent wins: if the new Realm beats the Vault hand, replace it (old Vault cards return to the deck)
- Game end: best Vault hand earns VP equal to player count
- Celestials count in Vault for celestial win condition (already partially implemented)
- Vault is also used as tiebreaker instead of Tome cards

These three are complex. For this prompt, **implement only the config flags and the stubs** — add the config keys, add placeholder logic that checks the flags, and add TODO comments for the full implementations. The Ace High and Charity variants should be fully implemented. Two-Player, Extended Arcana, and Vault should have the config flags, basic tests that verify the flags exist and default correctly, and TODO stubs in the engine.

### Commit

`feat: implement Ace High, Charity, Major Arcana payment; add variant toggle stubs`

---

## Phase 6: Update Editor and Run Full Verification

### 6.1 Update Game Rules Editor

Add the new config flags to `GameRulesEditor.jsx` with tooltips:

- **Ace High**: "When enabled, Aces rank above Kings in poker hand evaluation. Purchase value stays at 1. Default: on."
- **Charity**: "When enabled, players who score zero points in a round may carry one card into the next round. Default: on."
- **Two-Player Variant**: "Removes cards 2-6, modifies hand rankings for 2-player games. Default: off."
- **Extended Arcana**: "Adds cards 22-26 to the deck and removes 5 random cards for 2-5 player games. Default: off."
- **Vault**: "Winners keep their Realm as a Vault between rounds. Best Vault earns VP at game end. Default: off."

Use checkbox fields for boolean toggles (not number inputs).

### 6.2 Update `data/cards.json`

Add the new config flags to the `gameRules` section.

### 6.3 Update tooltips

Add tooltip text for the new fields in `editor/src/utils/tooltips.js`.

### 6.4 Update the schema validator

Add the new boolean fields to the validation in `editor/src/utils/schema.js` so they pass validation.

### 6.5 Full verification

Run the complete test suite:

```bash
npx vitest run
```

Then run a simulation to verify the engine still produces sane results:

```bash
node index.js --games 500 --players 4 --seed 42 --report
```

Check that:
1. All tests pass (should be 300+)
2. Ace High is on by default → pair of Aces should be strong in results
3. Display pricing shows correct values in report
4. The Fool's success rate likely decreases (it's harder now)
5. No crashes, no infinite loops

### Commit

`feat: update editor with new variant toggles, tooltips, and validation`

---

## Important Constraints

- **Do NOT break the generator architecture.** New decision points (HERMIT_CHOOSE, TOWER_CHOOSE) must yield from generators and be handled by both AI and human paths.
- **Keep backward compatibility.** Old configs without the new flags should work using defaults.
- **The `evaluateHand` options parameter must be optional.** All existing calls without options must work unchanged (defaulting to aceHigh=false to not break the 44 poker tests).
- **Update CLAUDE.md** with the new decision types and config flags.
- **All 282+ existing tests must still pass** (some Fool tests may need updating since behavior changed).
