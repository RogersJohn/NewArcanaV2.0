# New Arcana v2.1

A statistical simulation engine, playable browser game, and card editor for **New Arcana**, the tarot card game designed by Danny Rafferty.

Three tools:

- **Game Client** — Play New Arcana in your browser against AI opponents
- **Card Editor** — Edit card definitions, game rules, and run simulations
- **Stats Engine** — Run thousands of simulated games to analyze card balance and game dynamics

Built with Node.js, React + Vite (client and editor), and pure JavaScript (engine).

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

For the game client and editor:

```bash
cd client && npm install && cd ..
cd editor && npm install && cd ..
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

1. **Start screen** — Choose number of players (3–5) and AI difficulty:
   - Easy = random decisions
   - Medium = diverse AI personalities (9 types with weighted scoring)
   - Hard = scoring-focused AI
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
| `--players N` | Number of players (2–6) | 4 |
| `--ai TYPE` | AI assignment: `diverse`, `all-random`, `all-scoring`, `all-builder`, `all-aggressor`, `all-celestial`, `all-collector`, `all-controller`, `all-tactician`, `all-passive`, `all-opportunist`, `all-mcts` | diverse |
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

# MCTS AI (strongest, slower)
node index.js --games 50 --players 4 --ai all-mcts
```

---

## AI System

The AI uses a **unified personality-weighted scoring system** (`src/ai/personality.js`). Every legal action is scored, and the highest-scoring action is chosen (with small controlled randomness for human-like variance). Personality comes from weight profiles that bias each AI toward different play styles.

### AI Personalities

| AI | Style | Key Trait |
|----|-------|-----------|
| Opportunist | Balanced evaluator | Adapts to game state, moderate on all axes |
| Passive | Pure builder | Never attacks, focuses on realm completion |
| Builder | Strong hands | Prioritizes multi-card sets, minimal attacks |
| Aggressor | Disruptive | High attack rate, targets leaders |
| Celestial | Alternate win | Pursues 3-Celestial victory, buys Celestials aggressively |
| Controller | Defensive | Holds Aces, blocks readily, protects realm |
| Collector | Card hoarder | Buys Major Arcana frequently, uses Wheel of Fortune |
| Tactician | Round timer | Strategic Judgement usage, attacks marker holders |
| Scoring | Analytical | Position-aware evaluation, low variance |
| MCTS | Monte Carlo | Tree search with rollouts — strongest but slowest |
| Random | Baseline | Pure random choices (used for "Easy" difficulty) |

---

## Running Tests

```bash
npm install    # if not already done
npx vitest run
```

The full test suite runs 329 tests across 14 files and takes about 60–90 seconds. Statistical regression tests and the poker cross-validation account for most of the time.

To run a single test file:

```bash
npx vitest run test/poker.test.js
```

---

## Project Structure

```
src/                    # Engine source code
  engine.js             # Game loop orchestration (generator-based)
  actions.js            # Legal action enumeration
  scoring.js            # Round-end and game-end scoring + AI driver
  poker.js              # Poker hand evaluation
  cards.js              # Card creation and constants
  state.js              # Game state management
  effects.js            # Card effects (Royals, Aces, Major Arcana)
  effect-resolver.js    # Data-driven effect resolution
  game-controller.js    # Async interface for browser client
  simulation.js         # Monte Carlo simulation runner
  stats.js              # Statistics aggregation and reporting
  card-balance.js       # Card balance analysis
  compare.js            # A/B config comparison
  config.js             # Config loader (Node.js, reads from disk)
  config-core.js        # Config merger (no filesystem dependency)
  rng.js                # Seeded PRNG (xoshiro128**)
  history.js            # Decision history recording and replay
  ai/
    personality.js      # Unified scoring function + weight profiles
    base.js             # RandomAI base class (API contract)
    awareness.js        # Shared utilities (threats, hand potential, VP urgency)
    card-value.js       # Config-aware Major Arcana valuation
    card-tracker.js     # Bayesian card counting
    opportunist.js      # Balanced evaluator
    passive.js          # Pure builder, no attacks
    builder.js          # Strong hand builder
    aggressive.js       # Disruptive attacker
    celestial.js        # Alternate win condition pursuer
    controller.js       # Defensive, protection-focused
    collector.js        # Major Arcana hoarder
    tactician.js        # Round-timing specialist
    scoring.js          # Analytical position evaluator
    mcts.js             # Monte Carlo Tree Search AI
    index.js            # AI registry, factory, assignment
client/                 # React game client (Vite)
  src/components/       # UI components
  src/hooks/            # Game controller hook
  src/utils/            # Formatting, tooltips, state snapshots
  src/styles/           # CSS
editor/                 # React card editor (Vite)
  src/components/       # Editor UI components
  src/worker/           # Simulation web worker
  src/utils/            # Config defaults
desktop/                # Electron desktop app wrapper
  main.js               # Electron main process
  build.js              # Builds client + editor for packaging
  launcher/             # Launcher HTML page
data/
  cards.json            # Card definitions and game rules (editable)
test/                   # Test suite (329 tests, 14 files)
scripts/                # Utility scripts
RULES.md                # Full game rules (by Danny Rafferty)
CARDS.md                # Card reference
CLAUDE.md               # Development guide
```

---

## Changing Card Values

All card definitions live in `data/cards.json`. You can change values and rerun simulations without editing any code.

Examples of what you can tweak:

- **Scoring**: Change `celestialVp`, `plagueVp`, `potGrowth`, `potInitialPerPlayer`
- **Game rules**: Change `handSizeLimit`, `tomeCapacity`, `realmTrigger`, `maxTurnsPerRound`
- **Buy prices**: Adjust `draw`, `display0`–`display2`, `discard`
- **Bonus cards**: Change VP awards, suit requirements, tie rules
- **Protection cards**: Reassign which suits are protected by which Major Arcana
- **Variants**: Toggle `aceHigh`, `charityEnabled`, `vaultEnabled`, `extendedArcana`

After editing, test the impact:

```bash
# Run with your modified config
node index.js --games 1000 --players 4 --config data/cards-modified.json

# Or compare original vs modified side by side
node index.js --compare data/cards.json data/cards-modified.json
```

---

## Desktop App (Windows)

Download `NewArcana.exe` from the [Releases page](https://github.com/RogersJohn/NewArcanaV2.0/releases). Double-click to run — no installation needed.

The app includes:
- **Play Game** — play New Arcana against AI opponents
- **Card Editor** — edit cards, rules, run simulations, compare configs
- **Quick Sim** — run balance tests with your current card config

### Building from Source

```bash
cd desktop
npm install
node build.js           # Build React apps into desktop/build/
npx electron-builder    # Package into NewArcana.exe (in desktop/dist/)
```

Requires a Windows environment for the final packaging step. See `.github/workflows/build-exe.yml` for automated CI builds.

---

## Configuration Notes

The current `data/cards.json` ships with `aceHigh: true`, meaning Aces are ranked above Kings (value 15). This is the Ace High variant described in RULES.md. To play with Aces low (rank 1, below 2), set `aceHigh: false`.

Display buy prices in the default config: slot 0 (leftmost, newest card) = 9, slot 1 = 8, slot 2 (rightmost, oldest) = 7. Draw pile = 6. Discard pile = 10.

---

## Known Issues

- Pot ties award to the first player found rather than splitting
- Some rule ambiguities are documented awaiting designer decisions
- The MCTS AI is significantly slower than heuristic AIs (~20s per game vs <0.1s)
