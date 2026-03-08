# Claude Code Prompt: Card-Focused Simulation Reports

## Context

The SimRunner in the card editor currently shows AI win rates as the primary output, with a tiny "Card Highlights" section that names 4 cards. Danny doesn't care about AI win rates — he cares about the Major Arcana cards. The CLI already produces detailed card reports via `computeCardAnalytics()` (from `src/stats.js`) and `analyzeCardBalance()` (from `src/card-balance.js`), but none of this data reaches the SimRunner UI.

This prompt overhauls the SimRunner to show the card data front and center, with AI win rates demoted to a collapsible secondary section.

One phase. Run `npx vitest run` at the end to verify nothing broke.

---

## What the Worker Needs to Return

The Web Worker currently calls `aggregateStats(sim)` and returns the result. It needs to ALSO call `computeCardAnalytics(sim.results)` and `analyzeCardBalance(sim.results)` and return those alongside the existing stats.

### Update `editor/src/worker/simWorker.js`:

```javascript
import { runSimulation } from '@engine/simulation.js';
import { aggregateStats, computeCardAnalytics } from '@engine/stats.js';
import { analyzeCardBalance } from '@engine/card-balance.js';

self.onmessage = function(e) {
  const { config, games, players, seed } = e.data;

  try {
    const sim = runSimulation({
      games, players, seed,
      aiAssignment: 'diverse',
      cardConfig: config,
    });

    const stats = aggregateStats(sim);
    const cardAnalytics = computeCardAnalytics(sim.results);
    const cardBalance = analyzeCardBalance(sim.results);

    self.postMessage({
      type: 'complete',
      stats,
      cardAnalytics,
      cardBalance,
      errors: sim.errors,
      completedGames: sim.completedGames,
      seed,
    });
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message });
  }
};
```

NOTE: `analyzeCardBalance` in `src/card-balance.js` currently uses `MAJOR_ARCANA_DEFS` imported directly from `src/cards.js` and has hardcoded card number sets (`ACTION_CARDS`, `BONUS_CARDS`). These should be derived from the config that was passed in. Check if `analyzeCardBalance` accepts a config parameter — if not, it may need to be modified to accept one, or the hardcoded sets need to be replaced with effect-data-driven lookups. If modifying `card-balance.js`, ensure the existing tests still pass.

---

## Redesign the SimRunner UI

Replace the current SimRunner layout with a tabbed report view. The simulation controls (games/players/seed/run button) stay at the top. Below them, results are shown in tabs.

### Layout:

```
┌─────────────────────────────────────────────────────────────────┐
│  Simulation                                                      │
│  Games: [100▾]  Players: [4▾]  Seed: [auto]  [▶ Run Simulation] │
│                                                                  │
│  ┌─────────┬──────────┬──────────┬──────────┬──────────┐        │
│  │ Overview │ Power    │ Balance  │ Bonuses  │ Game     │        │
│  │         │ Rankings │ Analysis │          │ Stats    │        │
│  └─────────┴──────────┴──────────┴──────────┴──────────┘        │
│                                                                  │
│  [Tab content here]                                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Tab 1: Overview (default)

A dashboard with the key card metrics at a glance. This is what Danny sees first.

**Top row — 4 summary cards:**
```
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ 200 games    │ │ 4.3 rounds   │ │ 78% Death    │ │ 3% Celestial │
│ 0 errors     │ │ avg length   │ │ ends game    │ │ wins         │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```

**Major Arcana table — the main content:**

A sortable table showing ALL 21-27 Major Arcana cards with the key metrics from `stats.cardStats`. Columns:

| Card | Purchased | Winner Tome | Bonus Rate | Avg Bonus VP | Wild Uses | Winner Affinity |
|------|-----------|-------------|------------|-------------|-----------|----------------|
| The World (21) | 131 | 34 (26%) | - | - | 59 | 23.7% |
| The Moon (18) | 125 | 28 (22%) | - | - | 60 | 31.2% |
| The Lovers (6) | 81 | 8 (10%) | 46% | 1.3 | 24 | 17.3% |
| ... | | | | | | |

- Clicking a column header sorts by that column
- "Winner Tome" should show count AND percentage (count / total games)
- Bonus Rate and Avg Bonus VP should show "-" for non-bonus cards (action, celestial)
- Highlight cells with anomaly flags: red for <<LOW>>, green for <<HIGH>>
- Death row should be grayed out / italic (it's never purchased)

### Tab 2: Power Rankings

From `cardAnalytics.powerRankings`. Show as a visual ranked list:

```
 #1  The Moon (18)         ████████████████████░  0.786
     Tome: 1.00  Buy: 0.95  VP: 0.00

 #2  The World (21)        ███████████████████░░  0.750
     Tome: 0.90  Buy: 1.00  VP: 0.00

 #3  The Devil (15)        ████████████░░░░░░░░░  0.479
     Tome: 0.40  Buy: 0.93  VP: 0.00

 #4  Justice (11)          ███████████░░░░░░░░░░  0.465
     Tome: 0.30  Buy: 0.65  VP: 0.60
```

Each entry shows the composite score as a bar, plus the three sub-scores (Tome presence in winning games, Purchase frequency, VP contribution). Use color coding: gold for top 3, white for middle, dim for bottom 5.

### Tab 3: Balance Analysis

From `cardBalance.metrics`. Show all 5 balance metrics as separate sections, each as a table with anomaly flags visually highlighted.

**Section 1: Winner Affinity** (does buying this card correlate with winning?)
- Table: Card | Bought | By Winner | Rate | Flag
- Flag cells: red background for <<LOW>>, green for <<HIGH>>

**Section 2: VP Delta** (how much VP do holders gain vs non-holders?)
- Table: Card | Held In Games | VP Delta | Flag
- Color the delta column: green for positive, red for negative
- Flag: orange for <<WEAK>>, red for <<OP>>

**Section 3: Action Effectiveness** (how often do action cards get ace-blocked?)
- Table: Card | Succeeded | Ace-Blocked | Total | Success Rate | Flag
- Only show action cards

**Section 4: Tome Bonus Hit Rate** (how often do bonuses actually fire?)
- Table: Card | Scored | Hierophant | Failed | Hit Rate | Flag
- Only show bonus cards
- Flag: red for <<LOW>>

**Section 5: Purchase Rate** (are cards being bought or aging off the display?)
- Table: Card | Bought | Display Appearances | Aged Off | Buy Rate | Flag
- Flag: red for <<IGNORED>>

### Tab 4: Bonuses

Detailed view of only the bonus cards. From `cardAnalytics.bonusSuccessRates` plus `stats.cardStats`.

For each bonus card, show:
- Card name and bonus type (in plain English from tooltips, not code names)
- Times scored / times failed / hit rate
- Average VP when scored
- Hierophant assists (how many times Hierophant rescued a failed bonus)
- VP contribution to winners specifically

Show this as cards/panels, not a table:

```
┌─ The Lovers (6) ─────────────────────────────┐
│ Bonus: VP per pair of matching ranks          │
│                                               │
│ Scored: 53 times  |  Failed: 71 times         │
│ Hit Rate: 42.7%   |  Avg VP: 1.3              │
│ Hierophant assists: 7                         │
│ In winner tomes: 8 / 200 games (4.0%)         │
│ ████████████████░░░░░░░░░░░░  42.7% hit rate  │
└───────────────────────────────────────────────┘
```

### Tab 5: Game Stats

The current AI-focused data, demoted to the last tab. Keep the existing AI win rates with bars, game end reasons, VP distribution, position win rates. This is still useful, just not the primary view.

---

## Implementation Details

### Create new components

Split the SimRunner into smaller components:

```
editor/src/components/sim/
├── SimControls.jsx      # Games/players/seed/run button (top bar)
├── SimOverview.jsx      # Tab 1: summary cards + sortable card table
├── SimPowerRankings.jsx # Tab 2: ranked card list with bars
├── SimBalance.jsx       # Tab 3: 5 balance metric tables
├── SimBonuses.jsx       # Tab 4: bonus card detail panels
├── SimGameStats.jsx     # Tab 5: AI win rates, game end reasons (existing content)
└── SimTabs.jsx          # Tab navigation wrapper
```

Keep `SimRunner.jsx` as the container that manages state and passes data to these sub-components.

### Sortable table helper

Create a simple sortable table. When clicking a column header, sort rows by that column (toggle ascending/descending). Use a small arrow icon (▲/▼) to indicate sort direction. No external library — just React state + Array.sort.

### Color coding for anomaly flags

```css
.flag-high { background: rgba(34, 197, 94, 0.15); color: #4ade80; }
.flag-low { background: rgba(239, 68, 68, 0.15); color: #f87171; }
.flag-weak { background: rgba(251, 146, 60, 0.15); color: #fb923c; }
.flag-op { background: rgba(239, 68, 68, 0.2); color: #f87171; font-weight: 600; }
.flag-blocked { background: rgba(251, 146, 60, 0.15); color: #fb923c; }
.flag-ignored { background: rgba(107, 114, 128, 0.2); color: #9ca3af; }
```

### Bonus type labels

In the Bonuses tab, translate code bonus types to plain English:
- `foolDuplicate` → "Duplicates opponent's best bonus"
- `suitMajority` → "VP for most cards of a chosen suit (strict majority)"
- `suitHighest` → "VP for most cards of [SUIT]"
- `pairCounting` → "VP per pair of matching ranks"
- `hermitExclusive` → "VP if only card in Tome"
- `noSuitInRealm` → "VP if no [SUIT] in Realm"
- `hierophant_blessing` → "Failed bonuses score 1 VP instead of 0"

### Compare mode

When A/B compare is active, show a delta column in each table:
- Overview table: show both configs side by side or show delta values
- Power Rankings: show rank change (↑3, ↓2, NEW)
- Balance tables: show delta for each metric

This doesn't need to be elaborate — even just showing "Current: X | Saved: Y | Δ: ±Z" for key metrics in the Overview tab is valuable.

### Export

Update the "Export Full Report as JSON" button to include `cardAnalytics` and `cardBalance` in the exported JSON, not just `stats`.

---

## Constraints

- **Do NOT modify `src/stats.js` or `src/card-balance.js`** unless `card-balance.js` needs a config parameter to derive card sets from effects instead of hardcoded numbers. If so, make the change backward-compatible (default to hardcoded if no config passed).
- **Keep the existing compare functionality** working. The compare mode in SimRunner should still work alongside the new tabs.
- **All 282 existing tests must pass.**
- **Use Tailwind utility classes** (from the CDN already loaded) for styling. Add custom CSS classes to `editor/index.html` only for the flag colors and any complex styling that Tailwind can't handle.
- **Keep it fast.** The card analytics computation is lightweight (it just aggregates game result arrays), so no performance concerns. The UI rendering is the main thing — don't over-render.

## Commit

`feat: overhaul SimRunner with card-focused reports — power rankings, balance analysis, bonus details`
