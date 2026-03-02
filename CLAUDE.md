# CLAUDE.md — New Arcana Stats Engine v2

## Project Overview

Monte Carlo simulation engine for the tarot card game "New Arcana" designed by Danny Rafferty. The core engine is built and functional. Two expansion workstreams are in progress: (A) improving the statistical engine and (B) building a browser-based game client where a human plays against AI opponents.

The engine was rebuilt from scratch from RULES.md and CARDS.md. The old project (https://github.com/NewarkCanningCompany/NewArcanaStatsEngine) had fundamental rule errors — do NOT reference or copy code from it.

## Tech Stack

- Node.js with ESM modules (`"type": "module"` in package.json)
- No external runtime dependencies for the engine (pure JS)
- Vitest for testing (`npm install -D vitest`)
- Game client: React + Vite (planned — see Workstream B)

## Commands

- Run tests: `npx vitest run`
- Run simulation: `node index.js --games 1000 --players 4 --ai diverse --json results/output.json`
- Single game debug: `node index.js --single --players 4 --verbose`
- Card balance analysis: `node index.js --games 1000 --card-balance --json results/balance.json`
- Card analytics report: `node index.js --games 1000 --report`

## File Structure

```
src/
├── cards.js          # Card creation, deck building, constants
├── poker.js          # Hand evaluation engine
├── state.js          # Game state: players, decks, piles, display, cloneState
├── actions.js        # Enumerate legal actions for active player
├── engine.js         # Game loop orchestration
├── effects.js        # Card effects: Royal attacks, Ace blocking, Major Arcana
├── scoring.js        # Round-end and game-end scoring
├── card-balance.js   # Card balance analysis (5 per-card metrics)
├── ai/
│   ├── base.js       # AI interface + RandomAI
│   ├── builder.js    # Focuses on building strong poker hands
│   ├── aggressive.js # Attacks opponents, disrupts leaders
│   ├── celestial.js  # Pursues 3-Celestial win condition
│   ├── controller.js # Defensive, holds aces, protects realm
│   ├── opportunist.js# Evaluates EV of each action dynamically
│   ├── passive.js    # Minimal interaction, steady building
│   ├── tactician.js  # Round-timing specialist, strategic Judgement
│   ├── collector.js  # Tome-focused, accumulates Major Arcana
│   ├── awareness.js  # Shared celestial threat detection
│   └── index.js      # Registry, factory, assignment
├── simulation.js     # Monte Carlo runner
└── stats.js          # Statistics aggregation and reporting
test/
├── poker.test.js
├── actions.test.js
├── engine.test.js
├── effects.test.js
└── scoring.test.js
scripts/
├── ai-coverage-diagnostic.js
└── card-balance.js
results/              # Simulation output data (JSON, HTML, MD)
data/                 # Card definitions and rule configs (planned — see task A2)
index.js              # CLI entry
RULES.md              # Full game rules
CARDS.md              # All card definitions and effects
PLAN.md               # Detailed expansion plan (reference document)
```

## Architectural Rules

- **Randomness:** All randomness MUST go through `state.rng` (seeded PRNG via `src/rng.js`). Never use `Math.random()` in game/simulation code.
- **Card definitions:** Card data should live in `data/cards.json`, not hardcoded in switch statements. Bonus values, VP awards, effect types, and purchase costs must be configurable so Danny can tweak values without editing source. *(Not yet implemented — see task A2.)*
- **State:** Game state is the single source of truth. Engine functions transform state. State carries a `log` array (human-readable messages) and an `events` array (structured analytics events).
- **AI interface:** AI classes extend `RandomAI` from `src/ai/base.js`. Every decision method must be implementable by both AI and human players (critical for the game client). The decision points are:
  - `chooseMajorKeep(majorCards)` — setup: pick 1 of 2 majors
  - `chooseAction(state, legalActions, playerIndex)` — main turn action
  - `chooseDiscard(state, playerIndex, numToDiscard)` — hand overflow
  - `chooseRealmDiscard(state, playerIndex, numToDiscard)` — realm overflow
  - `shouldBlockWithAce(state, playerIndex, action)` — reactive block
  - `shouldBlockWithKing(state, playerIndex, attackCard)` — reactive block
  - `chooseTomeDiscard(state, playerIndex)` — tome overflow
  - `chooseWheelSources(state, playerIndex)` — Wheel of Fortune sources
  - `chooseWheelKeep(cards)` — Wheel of Fortune pick
  - `chooseMagicianSuit(state, playerIndex)` — Magician bonus
  - `chooseFoolTarget(state, playerIndex, options)` — Fool bonus
- **No tight coupling to CLI or UI.** The engine must be a clean library that both the CLI and game client can import.

## Critical Game Rules

These rules were wrong in the old project and must stay correct. Read RULES.md and CARDS.md for full details.

### Draw Phase
- "Handsize" = cards in hand + cards in Realm
- Draw UP TO 6 cards total (hand + realm). If you have 4, draw 2. If you have 6+, still draw exactly 1.
- The Devil changes the limit to 7.

### Round-End Trigger
- END your turn with 5 cards in Realm → take the Round-End Marker.
- Round ends when you START your NEXT turn (still holding marker, still 5+ cards).
- If realm drops below 5 before your next turn (via attacks), pass marker clockwise to next player with 5 cards. If nobody has 5, return marker to center.

### Ace Value
- Ace = rank 1, BELOW a 2. Never high. Never dual.
- Lowest straight: A,2,3,4,5. Highest straight: 10,Page,Knight,Queen,King.

### Playing Sets to Realm
- ONE complete set OR cards that complete/repair an existing set per turn.
- Legal sets: Single, Pair, Three-of-a-Kind, Four-of-a-Kind, Five-of-a-Kind (requires wild), Straight, Flush, Straight Flush.
- Two-Pair and Full House are NOT playable as single sets (built across turns).

### Buy Phase
- Buy ONE Major Arcana by discarding UP TO 3 cards from hand to Minor discard pile.
- Prices: Draw pile top = 6, Display slot 1 = 7, slot 2 = 8, slot 3 = 9, Discard top = 10.
- Payment = sum of card values. Can overpay. Royals worth 11-14. Majors worth their number.

### Wild Cards
- Any Major Arcana can be played as wild into Realm IF no other Major is already there.
- Wild is EVERY suit and ANY value simultaneously — always makes strongest possible hand.
- Vulnerable to Royal attacks of ANY suit. Can be Ace-blocked when played.
- Multiple wilds possible (via Queen steal or Strength).

### Display Aging
- Round end: slot 3 → Major discard, slots 1&2 slide right, new card → slot 1.
- If Death revealed during aging, game ends immediately.

### The Pit
- Face-down pile for cards used in actions. NEVER recycled.
- When Minor draw pile empties: shuffle Minor discard into new draw pile. Pit stays separate.

### Protection Cards
- Temperance (14) = CUPS, Faith (22) = SWORDS, Hope (23) = WANDS, Prudence (25) = COINS.
- Royal attacks of the protected suit on Realm cards FAIL. Attacking card still goes to Pit.

### Death Placement (Setup)
- Remove Death → deal 2 Majors each (keep 1, discard 1 face-up) → shuffle discards → deal face-down until 2 remain → dealt cards to BOTTOM of Major pile → shuffle Death + 2 remaining → place at very BOTTOM → deal 3 to Display from top.

### Poker Rankings (strongest → weakest)
1. Five-of-a-Kind (requires wild)
2. Straight Flush
3. Four-of-a-Kind
4. Full House
5. Flush
6. Straight
7. Three-of-a-Kind
8. Two Pair
9. One Pair
10. High Card

### Pot Mechanics
- Initial pot = 1vp per player.
- Each round: add (last pot amount + 1) to pot. With 4 players: round 1 = 4vp, round 2 adds 5vp, round 3 adds 6vp. Unclaimed pots carry over.

### Game End Conditions
1. Death revealed (purchased, drawn to display, or revealed during aging)
2. 3+ Celestials in Tome/Realm/Vault at end of any round → immediate win
3. Not enough Minor Arcana to draw/deal after reshuffling discard

### Bonus Card Rules
- Bonuses only fire if player has ≥1 card in Realm
- Magician requires strictly MORE of named suit (no ties). High Priestess/Empress/Emperor/Justice allow ties.
- Hierophant: failed bonuses score 1vp instead of 0
- Fool: duplicates the best opponent bonus (evaluated against opponent's state)
- Hermit: 1vp only if it's the sole card in Tome

## Code Style

- Plain objects, not classes (except AI classes which need method dispatch)
- Functions are pure where possible (state in, state out)
- Mutation is OK for game state during play (performance matters for Monte Carlo)
- No console.log in library code — use `log(state, message)` for game log, `recordEvent(state, type, data)` for analytics
- JSDoc comments on all public functions
- Keep files under 400 lines. Split if exceeded.

## Testing Philosophy

- Test tricky rules: round-end marker passing, Ace blocking chains, wild card optimization, Death placement
- Each test should verify a RULE, not an implementation detail
- Descriptive test names: `"Ace blocks Queen attack and both go to Pit"`
- Statistical regression tests: run seeded games, assert key metrics within expected ranges

## Common Pitfalls

1. Ace = 1, always. Never high.
2. Players draw from Minor draw pile, not discard pile.
3. Check Tome protections BEFORE resolving Royal attacks.
4. Buy payment goes to Minor discard, not Pit.
5. Pit is separate from discard, never recycled.
6. Refill Display left-to-right after taking a card.
7. Wild cards make the BEST possible hand — try all combinations.
8. Five-of-a-Kind beats Straight Flush.
9. Cap turns per round at 50 as safety valve.
10. Death can appear during Display aging — check for it.
11. `nextId` counter in cards.js is a global — will collide in parallel execution.

---

## Expansion Roadmap

Full details in PLAN.md. Below is the summary for task-by-task execution.

### Workstream A: Statistical Engine Improvements

**A1. Seeded RNG** — DONE
- `src/rng.js`: xoshiro128** PRNG with splitmix32 seed derivation
- `state.rng` created in `createInitialState(numPlayers, extended, seed?)`
- All ~25 `Math.random()` calls replaced with `state.rng.next()`/`state.rng.nextInt()`
- `--seed N` CLI flag. Per-game seed in JSON output.
- Verified: same seed produces byte-identical results across runs

**A2. Data-Driven Card Definitions** — CRITICAL for Danny
- Create `data/cards.json` with all card definitions, configurable values (VP awards, bonus types, costs, effects, game rules like hand limits and pot math)
- Refactor `scoring.js`, `effects.js`, `engine.js` to read from card config instead of hardcoded switches
- `createInitialState()` accepts optional `cardConfig` parameter
- Add `--config path/to/cards.json` CLI flag
- Done when: Danny can change celestialVp from 2 to 1 in JSON and see different simulation results without editing source

**A3. A/B Comparison Mode** — depends on A1 + A2
- `--compare configA.json configB.json` CLI mode
- Runs N games with each config using same seeds
- Produces diff report: win rate deltas with statistical significance, VP shift, card power ranking changes, game length impact
- Output as console text and self-contained HTML report

**A4. Immutable State & History** — HIGH priority
- Improve `cloneState()` robustness (current JSON.parse/stringify is fragile with Sets)
- Add `state.history[]` recording each action (action object + player index + round)
- Add `replayFromHistory(seed, history)` for replay, undo, and save/load
- Done when: a game can be replayed from seed + action history to identical final state

**A5. Test Coverage Expansion** — ongoing, spread across all tasks
- Targeted tests for each Major Arcana effect
- Regression tests for Fix #1–#8 (currently no tests guard against recurrence)
- Statistical regression: 10,000 seeded games, assert metrics within expected ranges
- Property-based tests for poker hand evaluation

**A6. Smarter AI** — LOW for stats, HIGH for game client
- Phase 1: `ScoringAI` with 1-step lookahead (requires A4 cloneState)
- Phase 2: Tune AI personalities using card config metadata (requires A2)
- Phase 3: Difficulty levels for game client (Easy/Medium/Hard)

### Workstream B: Game Client

**B1. Engine Interface Layer** — CRITICAL, hardest task, blocks all client work
- Create async `GameController` that wraps the synchronous engine
- Advances game one decision point at a time, yields state + options to caller
- For AI players: auto-resolves instantly. For human: pauses and returns control to UI.
- Requires refactoring the nested synchronous game loop to pause at all 11 decision points
- Recommended approach: generator/yield pattern — prototype on `CHOOSE_ACTION` first
- Done when: a test can create a GameController, feed it manual decisions for a human player, and complete a game

**B2. Client Shell & Game Board** — depends on B1
- Vite + React project (packages/client/ in monorepo)
- Core components: GameBoard, PlayerHand, Realm, Tome, MajorDisplay, OpponentSummary, Pot, ActionPanel, GameLog, ScoreBoard
- State management: useReducer with game state from GameController
- No card art initially — styled divs with suit symbols and rank text
- Monorepo structure: packages/engine/, packages/cli/, packages/client/

**B3. Interaction Model** — depends on B1 + B2
- Card click → highlight → ActionPanel shows options → targeting mode if needed → confirm
- Blocking reactions: modal/overlay for Ace/King block decisions
- UI flows for all decision types (Wheel of Fortune source selection, Magician suit pick, etc.)

**B4. AI Turn Visualization** — depends on B3
- Configurable delay per AI action (500ms-1500ms)
- Visual animation for card moves, attacks, VP changes
- Fast-forward button to skip remaining AI turns

**B5. Game Flow Screens** — depends on B3
- Start screen (opponents, difficulty, config), setup phase, round transitions, game over, settings

**B6. Polish & Visuals** — LOW priority
- Card art/templates, sound, responsive mobile, tutorial, save/load

### Execution Order

```
Phase 1 — Foundation (do first)
├── A1. Seeded RNG
├── A4. State History
└── Monorepo restructure (packages/engine, packages/cli, packages/client)

Phase 2 — Core
├── A2. Data-Driven Cards
├── B1. Engine Interface Layer
└── A5. Tests (ongoing)

Phase 3 — Parallel
├── A3. A/B Comparison
├── A6. Smarter AI (Phase 1)
├── B2. Client Shell
└── B3. Interaction Model

Phase 4 — Polish
├── B4. AI Visualization
├── B5. Game Flow Screens
└── B6. Card Visuals
```

### Task Completion Checklist

When completing any task, update this section by marking it done and noting the date/commit.

- [x] A1. Seeded RNG — completed 2026-03-01
- [x] A2. Data-Driven Card Definitions — completed 2026-03-01
- [x] A3. A/B Comparison Mode — completed 2026-03-02
- [x] A4. Immutable State & History — completed 2026-03-01
- [ ] A5. Test Coverage (ongoing)
- [ ] A6. Smarter AI
- [ ] B1. Engine Interface Layer
- [ ] B2. Client Shell & Game Board
- [ ] B3. Interaction Model
- [ ] B4. AI Turn Visualization
- [ ] B5. Game Flow Screens
- [ ] B6. Polish & Visuals
- [ ] Monorepo restructure
