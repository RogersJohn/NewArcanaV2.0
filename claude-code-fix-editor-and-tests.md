# Claude Code Prompt: Fix Editor Save Bug & Comprehensive Card Tests

## Context

A critical UX bug was found: the card editor has a two-stage save pattern where Danny's edits sit in a local `draft` state inside `CardEditor.jsx` until he manually clicks "Save." If he switches tabs and exports without clicking Save, the export contains the OLD values. Danny changed The Lovers to give 10 VP per pair, exported, ran a simulation, and got results showing 1 VP per pair — his change was silently lost.

This prompt fixes the editor bug and adds comprehensive per-card tests to ensure every card effect, bonus, and config-driven value change works end-to-end.

Two phases. Run `npx vitest run` after each.

---

## Phase 1: Fix the Editor Save Bug

### The Problem

In `editor/src/components/CardEditor.jsx`:
- Line 17: `const [draft, setDraft] = useState(card)` creates local state
- Line 29: `update()` modifies `draft` only
- Line 38: `handleSave()` calls `onChange(draft)` to push to parent — BUT only when clicked
- The Export function in `ImportExport.jsx` reads from `App.jsx`'s `config` state, which only updates after Save

Danny sees "10" in the field, thinks it's saved, exports, and gets "1" in the file.

### The Fix

**Remove the two-stage pattern. Every edit should immediately propagate to the parent config.**

**1.1** Rewrite `CardEditor.jsx` to remove the `draft` state entirely. All edits go directly to `onChange`:

```jsx
export default function CardEditor({ card, allCards, onChange, onDelete }) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Reset delete confirm when card changes
  useEffect(() => {
    setShowDeleteConfirm(false);
  }, [card]);

  const errors = validateCard(card, allCards);

  const update = (key, val) => {
    const next = { ...card, [key]: val };
    if (key === 'category' && val !== card.category) {
      next.effect = buildDefaultEffect(val);
    }
    onChange(next);  // Immediately propagate to parent
  };

  // ... render using `card` directly, not `draft`
}
```

Remove the Save button entirely. Remove the Revert button entirely. Remove `isDirty`. Remove `handleSave`. Every input's `onChange` calls `update()` which calls the parent's `onChange` directly.

**1.2** Do the same for `EffectEditor.jsx` and `BonusEditor.jsx` — verify that their `onChange` props propagate all the way up. Currently they do (they call the parent's `onChange`), but verify the chain: BonusEditor.onChange → EffectEditor.onChange → CardEditor draft.setDraft → (BROKEN: stays in draft). After the fix: BonusEditor.onChange → EffectEditor.onChange → CardEditor.update → App.updateCard → config state updated.

**1.3** Update `GameRulesEditor.jsx` to also apply immediately (verify it already does — I believe the rules editor writes directly to config state, not through a draft).

**1.4** Remove the "Unsaved" indicator concept. Since everything auto-saves to config state on every keystroke, there's no "unsaved" state per card. The only meaningful "unsaved" state is "not yet exported to file" — and that's handled by the save slots feature (when it's added).

**1.5** Validation: if a card has validation errors, the edit should still propagate to the parent config (so it's auto-saved), but the card should be visually flagged as invalid. A global warning like "1 card has validation errors — fix before exporting" should appear when the user goes to the Import/Export tab.

**1.6** Verify that rapid editing (typing a multi-digit number like "100" in a VP field) works correctly. Since each keystroke triggers onChange → parent setState → re-render → CardEditor receives new card prop, the input should stay responsive. If there's lag, use `useDeferredValue` or debounce the parent setState, but try without it first.

### 1.7 Test the fix manually

After implementing, verify:
1. Open editor, select The Lovers, change vpPerPair to 100
2. WITHOUT clicking anything else, go to Import/Export tab
3. Check the JSON preview at the bottom — Lovers should show `vpPerPair: 100`
4. Export the config
5. Open the exported file — verify it contains `vpPerPair: 100`

### 1.8 Commit

`fix: remove two-stage card save — all edits propagate immediately`

---

## Phase 2: Comprehensive Card Tests

Create a new test file `test/card-comprehensive.test.js` that tests every card's effect and every config-driven value. This file should be self-contained and test the full scoring/effect path, not just dispatch mapping.

### Test Structure

Organize by card. For every Major Arcana card, there should be at least one test proving its core mechanic works through the scoring/effect system using the data-driven config path.

**Helper setup for all tests:**

```javascript
import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/state.js';
import { createMinorCard, createMajorCard, MAJOR_ARCANA_DEFS } from '../src/cards.js';
import { scoreRoundEnd, scoreGameEnd, resolveBonus, checkCelestialWin } from '../src/scoring.js';
import { resolveRoyalAttack, applyTomeEffect, resolveTower, resolveChariot,
         resolveStrength, resolveHangedMan, resolveJudgement, resolvePlague,
         resolveWheelOfFortune, checkDeathRevealed } from '../src/effects.js';
import { setup, playGame } from '../src/engine.js';
import { createAIs } from '../src/ai/index.js';
import { runSimulation } from '../src/simulation.js';
import { RandomAI } from '../src/ai/base.js';
import { mergeConfig } from '../src/config-core.js';

function mc(suit, rank) { return createMinorCard(suit, rank); }

function major(number) {
  const def = MAJOR_ARCANA_DEFS.find(d => d.number === number);
  return createMajorCard(def.number, def.name, def.category, def.keywords);
}

function makeState(numPlayers = 4, seed = 42, configOverrides = null) {
  const state = createInitialState(numPlayers, false, seed, configOverrides);
  // Clear for manual setup
  state.minorDeck = [];
  state.majorDeck = [];
  state.display = [null, null, null];
  state.pot = 0;
  state.roundEndMarkerHolder = -1;
  for (const p of state.players) {
    p.hand = [];
    p.realm = [];
    p.tome = [];
  }
  return state;
}

function makeAIs(n) { return Array.from({ length: n }, () => new RandomAI()); }
```

### 2.1 Bonus Card Tests (round-end scoring)

For EACH bonus card, test that:
a) The bonus scores correctly with default config values
b) The bonus scores correctly when the VP value is changed via config
c) The bonus returns 0 when conditions aren't met

```
Card 0 — The Fool (foolDuplicate):
  - Scores by duplicating opponent's best scoring bonus
  - Returns 0 when no opponents have scoring bonuses
  - Config: changing an opponent's bonus VP changes what Fool copies

Card 1 — The Magician (suitMajority):
  - Scores when player has strictly more of named suit
  - Returns 0 when tied
  - Returns 0 when opponent has more
  - Config: changing vp from 1 to 5 awards 5vp

Card 2 — High Priestess (suitHighest, WANDS):
  - Scores 1vp when player has most WANDS
  - Scores on tie (allowTie: true)
  - Config: changing vp to 3 awards 3vp
  - Config: changing suit to CUPS evaluates CUPS instead

Card 3 — Empress (suitHighest, CUPS):
  - Scores 1vp for most CUPS
  - Config: changing vp to 5 awards 5vp

Card 4 — Emperor (suitHighest, COINS):
  - Scores 1vp for most COINS
  - Returns 0 when opponent has more

Card 5 — Hierophant (hierophant_blessing):
  - Does not score VP itself
  - Other failed bonuses in same Tome score 1vp
  - Blessing works even when realm is empty
  - Config: Hierophant doesn't score even if you change its VP

Card 6 — Lovers (pairCounting):
  - Scores 1vp per pair with default config
  - Scores 2vp for two pairs
  - Returns 0 when no pairs
  - Three-of-a-kind does NOT count as a pair (only exact 2)
  - Config: changing vpPerPair to 10 gives 10vp per pair
  - Config: changing vpPerPair to 100 gives 100vp per pair
  - WITH WILD: wild makes best hand, Lovers checks hand type not raw pairs

Card 9 — Hermit (hermitExclusive):
  - Scores 1vp when alone in Tome
  - Returns 0 when other cards in Tome
  - Config: changing vp to 3 awards 3vp

Card 11 — Justice (suitHighest, SWORDS):
  - Scores 1vp for most SWORDS
  - Config: changing vp to 2 awards 2vp

Card 14 — Temperance (noSuitInRealm, CUPS):
  - Scores 1vp when no CUPS in realm
  - Returns 0 when CUPS in realm
  - Wild cards do NOT count as CUPS for this check
  - Config: changing vp to 5 awards 5vp

Card 22 — Faith (noSuitInRealm, SWORDS):
  - Scores 1vp when no SWORDS in realm
  - Returns 0 when SWORDS in realm
  - Config: changing suit to WANDS checks WANDS instead

Card 23 — Hope (noSuitInRealm, WANDS):
  - Scores 1vp when no WANDS in realm
  - Returns 0 when WANDS in realm

Card 25 — Prudence (noSuitInRealm, COINS):
  - Scores 1vp when no COINS in realm
  - Returns 0 when COINS in realm
```

### 2.2 Action Card Tests

For each action card, test the core effect:

```
Card 7 — Chariot (MOVE_CELESTIAL_TO_TOME):
  - Steals celestial from opponent's Tome
  - Steals from Realm
  - Steals from Display (triggers refill)
  - Steals from major discard
  - Triggers Tome overflow when full

Card 8 — Strength (MOVE_MAJOR_TO_REALM):
  - Moves major from opponent Realm to own Realm
  - Moves major from opponent Tome to own Realm
  - Removes protection when stealing from Tome

Card 10 — Wheel of Fortune:
  - Draws 2, keeps 1, pits 1
  - Works with fewer available sources

Card 12 — Hanged Man (STEAL_FROM_TOME):
  - Steals from opponent Tome into own Tome
  - Triggers own Tome overflow
  - Transfers protection when stealing protection card

Card 16 — Tower (TOWER_DESTROY):
  - Destroys top card from all larger Tomes
  - Does nothing when no Tome is larger
  - Removes protection if destroyed card was a protection card

Card 20 — Judgement (CLAIM_ROUND_END_MARKER):
  - Sets roundEndMarkerHolder
  - Sets judgementTriggered
  - Round ends at start of next turn (verified via engine)

Card 26 — Plague (PLAGUE_TO_TOME):
  - Plays into target's Tome
  - Displaces when Tome full
  - Costs plagueVp at game end
  - Config: changing plagueVp to -10 costs 10vp
```

### 2.3 Tome On-Play Effect Tests

```
Card 9 — Hermit on-play (TOME_CARDS_TO_HAND):
  - Moves all other Tome cards to hand, Hermit stays
  - Removes protection from moved cards

Card 14 — Temperance on-play (PROTECT_SUIT, CUPS):
  - Adds CUPS to tomeProtections
  - CUPS Royal attacks are blocked while protection active

Card 15 — Devil on-play (DRAW_TO_LIMIT):
  - Draws up to limit (7 by default)
  - Config: changing limit to 9 draws to 9
  - getEffectiveHandLimit returns the limit while Devil in Tome

Card 22/23/25 — Faith/Hope/Prudence on-play (PROTECT_SUIT):
  - Faith adds SWORDS protection
  - Hope adds WANDS protection
  - Prudence adds COINS protection
```

### 2.4 Celestial and Death Tests

```
Cards 17-19, 21, 24 — Celestials:
  - Each earns celestialVp at game end (default 2)
  - Config: changing celestialVp to 5 awards 5vp each
  - 3 celestials trigger instant win
  - Config: changing celestialWinCount to 2 triggers win with 2

Card 13 — Death:
  - Appearing in display ends game immediately
  - Being purchased ends game
  - Does not trigger end if in hand/Tome (only display)
```

### 2.5 Config Round-Trip Tests (THE CRITICAL ONES)

These tests simulate Danny's exact workflow: modify config → run simulation → verify the change took effect.

```
describe('Config round-trip: editor → simulation', () => {
  
  it('Lovers vpPerPair=10 produces avg bonus VP >= 8 over 100 games', () => {
    const config = mergeConfig();
    config.majorArcana.find(c => c.number === 6).effect.bonus.vpPerPair = 10;
    
    const sim = runSimulation({
      games: 100, players: 4, seed: 99,
      aiAssignment: 'diverse', cardConfig: config,
    });
    
    // Find Lovers stats
    let totalBonusVp = 0, bonusCount = 0;
    for (const g of sim.results) {
      const le = g.cardEvents[6];
      if (le) { totalBonusVp += le.bonusVpTotal; bonusCount += le.bonusScored; }
    }
    
    const avgBonusVp = bonusCount > 0 ? totalBonusVp / bonusCount : 0;
    expect(avgBonusVp).toBeGreaterThanOrEqual(8); // 10 per pair, some get 20 for 2 pairs
    expect(avgBonusVp).toBeLessThan(25); // Sanity: shouldn't be astronomically high
  });

  it('Lovers vpPerPair=100 makes holders average 50+ VP', () => {
    const config = mergeConfig();
    config.majorArcana.find(c => c.number === 6).effect.bonus.vpPerPair = 100;
    
    const sim = runSimulation({
      games: 200, players: 4, seed: 42,
      aiAssignment: 'diverse', cardConfig: config,
    });
    
    // Holders should have dramatically higher VP
    let holdersVp = 0, holdersN = 0;
    for (const game of sim.results) {
      for (const p of game.players) {
        if (p.tomeCards.some(tc => tc.includes('Lovers'))) {
          holdersVp += p.vp;
          holdersN++;
        }
      }
    }
    
    if (holdersN > 0) {
      expect(holdersVp / holdersN).toBeGreaterThan(50);
    }
  });
  
  it('celestialVp=10 makes celestial holders dominant', () => {
    const config = mergeConfig();
    config.scoring.celestialVp = 10;
    
    const sim = runSimulation({
      games: 100, players: 4, seed: 77,
      aiAssignment: 'diverse', cardConfig: config,
    });
    
    // With 10vp per celestial (vs default 2), celestial holders should avg 20+ VP
    let celestialVp = 0, celestialN = 0;
    for (const game of sim.results) {
      for (const p of game.players) {
        const celestialCount = p.majorHoldings.filter(n => [17,18,19,21,24].includes(n)).length;
        if (celestialCount > 0) {
          celestialVp += p.vp;
          celestialN++;
        }
      }
    }
    
    if (celestialN > 0) {
      expect(celestialVp / celestialN).toBeGreaterThan(10);
    }
  });

  it('plagueVp=-20 makes Plague devastating', () => {
    const config = mergeConfig();
    config.scoring.plagueVp = -20;
    
    const sim = runSimulation({
      games: 100, players: 4, seed: 55,
      aiAssignment: 'diverse', cardConfig: config,
    });

    // Check that Plague holders have very low VP
    let plagueHolderVp = 0, plagueN = 0;
    for (const game of sim.results) {
      for (const p of game.players) {
        if (p.majorHoldings.includes(26)) {
          plagueHolderVp += p.vp;
          plagueN++;
        }
      }
    }
    
    if (plagueN > 0) {
      expect(plagueHolderVp / plagueN).toBeLessThan(5);
    }
  });

  it('config change vs default produces different VP distribution', () => {
    // Run same seed with default config and modified config
    const defaultSim = runSimulation({
      games: 50, players: 4, seed: 123, aiAssignment: 'diverse',
    });
    
    const config = mergeConfig();
    config.majorArcana.find(c => c.number === 6).effect.bonus.vpPerPair = 50;
    const modifiedSim = runSimulation({
      games: 50, players: 4, seed: 123, aiAssignment: 'diverse',
      cardConfig: config,
    });
    
    // VP distributions should be significantly different
    const defaultAvg = defaultSim.results.reduce((s, g) => s + g.vpDistribution.reduce((a, b) => a + b, 0), 0) / (50 * 4);
    const modifiedAvg = modifiedSim.results.reduce((s, g) => s + g.vpDistribution.reduce((a, b) => a + b, 0), 0) / (50 * 4);
    
    expect(modifiedAvg).toBeGreaterThan(defaultAvg * 1.5); // At least 50% higher avg VP
  });

  it('suitHighest VP change propagates (High Priestess vp=5)', () => {
    const config = mergeConfig();
    const hp = config.majorArcana.find(c => c.number === 2);
    hp.effect.bonus.vp = 5;

    const state = makeState(2, 42, config);
    state.players[0].tome = [major(2)];
    state.players[0].realm = [mc('WANDS', 5), mc('WANDS', 8)];
    state.players[1].realm = [mc('CUPS', 3)];

    const vp = resolveBonus(state, 0, state.players[0].tome[0], makeAIs(2));
    expect(vp).toBe(5);
  });

  it('noSuitInRealm VP change propagates (Temperance vp=7)', () => {
    const config = mergeConfig();
    const temp = config.majorArcana.find(c => c.number === 14);
    temp.effect.bonus.vp = 7;

    const state = makeState(2, 42, config);
    state.players[0].tome = [major(14)];
    state.players[0].realm = [mc('WANDS', 5)]; // No CUPS

    const vp = resolveBonus(state, 0, state.players[0].tome[0], makeAIs(2));
    expect(vp).toBe(7);
  });
});
```

### 2.6 Protection Card Tests (all 4)

Test each protection card individually:

```
describe('Protection cards', () => {
  for (const [number, suit, name] of [
    [14, 'CUPS', 'Temperance'],
    [22, 'SWORDS', 'Faith'],
    [23, 'WANDS', 'Hope'],
    [25, 'COINS', 'Prudence'],
  ]) {
    it(`${name} protects ${suit} from Royal attacks`, () => {
      // Setup: defender has protection card in tome, target of matching suit in realm
      // Attack with Page of matching suit → should fail
    });
    
    it(`${name} does NOT protect other suits`, () => {
      // Attack with Page of different suit → should succeed
    });
    
    it(`${name} bonus: scores when no ${suit} in realm`, () => {
      // Realm has only other suits → 1vp
    });

    it(`${name} bonus: fails when ${suit} in realm`, () => {
      // Realm has the protected suit → 0vp
    });
  }
});
```

### 2.7 Royal Card Tests (Page, Knight, Queen, King, Ace)

Ensure all royal mechanics work:

```
Page: destroy target + self → pit
Knight: steal target to hand, self → pit
Queen: move target to attacker realm, self → pit
King: blocks royal, both → pit
Ace: blocks royal/major/ace, attacker card + ace → pit
Ace chain: Ace2 blocks Ace1 → original proceeds
Ace blocking wild in a set: wild + ace → pit, minors still play
```

### 2.8 Timeout Budgets

The config round-trip tests run simulations, so they need generous timeouts:

```javascript
describe('Config round-trip: editor → simulation', () => {
  it('Lovers vpPerPair=10...', { timeout: 30000 }, () => { ... });
  it('Lovers vpPerPair=100...', { timeout: 60000 }, () => { ... });
  // etc.
});
```

### 2.9 Commit

`test: add comprehensive per-card tests and config round-trip verification`

---

## Verification Checklist

After both phases:

1. `npx vitest run` — all tests pass (should be 250+ now)
2. Open editor → change Lovers vpPerPair to 100 → go to Import/Export → JSON preview shows 100 → export file shows 100
3. `node index.js --games 100 --config <exported-file> --seed 42` → Lovers avgBonusVp > 80
4. No "Save" button exists in the card editor anymore
5. Typing in any field immediately updates the JSON preview in Import/Export tab
6. Every Major Arcana card (0-26) has at least one dedicated test in `test/card-comprehensive.test.js`
7. Changing any configurable VP value and running `resolveBonus` returns the changed value
