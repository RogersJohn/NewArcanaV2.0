# New Arcana v2.0

A statistical simulation engine and playable browser game for **New Arcana**, the tarot card game designed by Danny Rafferty.

Two main tools:

- **Game Client** — Play New Arcana in your browser against AI opponents
- **Stats Engine** — Run thousands of simulated games to analyze card balance, AI performance, and game dynamics

Built with Node.js, React + Vite (client), and pure JavaScript (engine).

---

## Prerequisites

- **Node.js v18+** — download from https://nodejs.org
- **Git** — to clone the repo
- **A modern browser** — Chrome, Firefox, Edge, or Safari

---

## Installation

```bash
git clone https://github.com/RogersJohn/NewArcanaV2.0.git
cd NewArcanaV2.0
npm install
```

For the game client:

```bash
cd client
npm install
cd ..
```

---

## Playing the Game (Browser Client)

Launch the dev server:

```bash
cd client
npm run dev
```

Then open **http://localhost:5173** in your browser.

### How to play

1. **Start screen** — Choose number of players (3-5) and AI difficulty:
   - Easy = random decisions
   - Medium = diverse AI personalities
   - Hard = scoring-based AI
2. **Your turn** — Click cards in your hand, then choose an action from the action panel on the right
3. **Blocking** — When an opponent attacks you or plays a Major Arcana, a block prompt appears automatically if you have an Ace or King
4. **Tooltips** — Hover over any card to see its name, value, and rules text
5. **Game log** — The log panel on the right shows everything that happens
6. **Game over** — See final scores, click "Show Game Log" for the full debug log, or "Copy Log" to share it
7. **Play Again** — Click to start a new game

---

## Card Editor (for Game Designers)

A browser-based editor for viewing and modifying card definitions, game rules, and scoring values.

```bash
cd editor
npm install   # first time only
npm run dev
```

Then open **http://localhost:5175** in your browser.

### How to use

1. **Cards tab** — Browse, search, and filter all Major Arcana cards. Click a card to edit its name, category, suit, keywords, and effect definition. Add new cards or delete existing ones.
2. **Game Rules tab** — Edit game rules (hand size, tome capacity, etc.), buy prices, and scoring values.
3. **Import/Export tab** — Export your config as `cards.json`, import a previously saved config, or reset to defaults.

### Workflow

1. Make changes in the editor
2. Export the config (downloads `cards.json`)
3. Replace `data/cards.json` in the repo with the exported file
4. Run the simulation to test the impact: `node index.js --games 1000 --players 4`
5. Commit the updated `data/cards.json`

---

## Running the Stats Engine (CLI)

Basic usage:

```bash
node index.js --games 1000 --players 4
```

### CLI Flags

| Flag | Description | Default |
|------|-------------|---------|
| `--games N` | Number of games to simulate | 1000 |
| `--players N` | Number of players (2-6) | 4 |
| `--ai TYPE` | AI assignment: diverse, all-random, all-scoring, all-builder, all-aggressor, etc. | diverse |
| `--seed N` | Seed for reproducible results | random |
| `--verbose` | Show detailed per-game logging | off |
| `--single` | Run one game with full verbose output | off |
| `--json FILE` | Save stats as JSON to file | none |
| `--report` | Show detailed card statistics report | off |
| `--card-balance` | Run card balance analysis with anomaly flags | off |
| `--extended` | Use 6-player Major Arcana set (26 cards) | off |
| `--config FILE` | Use a custom card definitions file | data/cards.json |
| `--compare A B` | A/B comparison: run games under two configs using same seeds | none |

### Examples

```bash
# Quick 100-game test
node index.js --games 100 --players 4

# Watch a single game play out
node index.js --single --players 4 --verbose

# Reproducible run with a fixed seed
node index.js --games 1000 --players 4 --seed 42

# Card balance analysis
node index.js --games 1000 --players 4 --card-balance

# Save results as JSON
node index.js --games 1000 --players 4 --json results/my-test.json

# Detailed card statistics report
node index.js --games 1000 --players 4 --report

# Compare two card configurations side by side
node index.js --compare data/cards.json data/cards-test.json

# All-aggressor AI test
node index.js --games 500 --players 4 --ai all-aggressor
```

---

## Reports

The stats engine generates reports directly via CLI flags. Pre-generated reports are in the `results/` directory — open any `.html` file in your browser.

### Card Balance Report

```bash
node index.js --games 1000 --players 4 --card-balance
```

Generates `results/card-balance-report.html` with per-card metrics and anomaly flags.

### A/B Comparison Report

```bash
node index.js --compare data/cards.json data/cards-modified.json
```

Generates `results/compare.html` showing win rate deltas, VP shifts, and statistical significance between two card configurations.

### What the reports include

- Game length distribution (rounds per game, turns per round)
- Game end reasons (Death revealed, purchased, Celestial win, etc.)
- VP distribution across all players and winners
- AI personality performance (win rates, average VP)
- Seat position advantage analysis
- Pot-winning hand types (Three-of-a-Kind, Two Pair, etc.)
- Celestial card scoring breakdown
- Action counts (sets played, Royal attacks, Ace blocks, King blocks, etc.)
- Full Major Arcana card statistics — how often each card was bought, played to Tome, played as Action, played as Wild, Ace-blocked, bonus fire rate, bonus VP, and total usage

---

## Changing Card Values

All card definitions live in `data/cards.json`. You can change values and rerun simulations without editing any code.

Examples of what you can tweak:

- **Scoring**: Change `celestialVp` from 2 to 1, adjust `plagueVp`, modify pot growth
- **Game rules**: Change `handSizeLimit`, `maxRealmSize`, `turnsPerRoundCap`
- **Buy prices**: Adjust costs for draw pile, display slots, and discard pile
- **Bonus cards**: Change VP awards, suit requirements, tie rules
- **Protection cards**: Reassign which suits are protected by which Major Arcana

After editing, test the impact:

```bash
# Run with your modified config
node index.js --games 1000 --players 4 --config data/cards-modified.json

# Or compare original vs modified side by side
node index.js --compare data/cards.json data/cards-modified.json
```

See `archive/DANNY_README.md` for a focused quick-start guide on card tweaking.

---

## Running Tests

```bash
npm install    # if not already done
npx vitest run
```

The full test suite runs ~170 tests and takes about 10-40 seconds. Statistical regression tests simulate hundreds of games so they account for most of the time.

To run a single test file:

```bash
npx vitest run test/poker.test.js
```

---

## Project Structure

```
src/                  # Engine source code
  engine.js           # Game loop orchestration
  actions.js          # Legal action enumeration
  scoring.js          # Round-end and game-end scoring
  poker.js            # Hand evaluation
  cards.js            # Card creation and constants
  state.js            # Game state management
  effects.js          # Card effects (Royals, Aces, Major Arcana)
  ai/                 # AI personalities (9 types)
  game-controller.js  # Async interface for client
client/               # React game client
  src/components/     # UI components
  src/hooks/          # Game controller hook
  src/utils/          # Formatting and tooltips
  src/styles/         # CSS
data/cards.json       # Card definitions (editable)
test/                 # Test suite (170 tests)
results/              # Simulation output data and HTML reports
RULES.md              # Full game rules
CARDS.md              # Card reference
CLAUDE.md             # Development guide
archive/              # Planning docs, prompts, designer quick-start
```

---

## Known Issues

- Celestial AI personality is overpowered (~58% win rate vs expected ~25%) and needs rebalancing
- Collector AI personality wins 0% of games and needs rebalancing
- Pot ties award to the first player found rather than splitting
- Some rule ambiguities are documented in `archive/questions-for-danny.md` awaiting designer decisions
