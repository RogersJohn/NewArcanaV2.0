# CLAUDE.md — New Arcana v2.2

## Project Overview

Monte Carlo simulation engine, playable browser game, and card editor for the tarot card game "New Arcana" designed by Danny Rafferty. All three tools are built and functional.

The engine was rebuilt from scratch from RULES.md and CARDS.md. The old project (https://github.com/NewarkCanningCompany/NewArcanaStatsEngine) had fundamental rule errors — do NOT reference or copy code from it.

## Tech Stack

- Node.js with ESM modules (`"type": "module"` in package.json)
- No external runtime dependencies for the engine (pure JS)
- Vitest for testing (`npx vitest run`)
- Client: React + Vite (`client/` directory)
- Card editor: React + Vite (`editor/` directory)
- Desktop app: Electron (`desktop/` directory)
- ESLint for linting (`npm run lint`)

## Commands

- Run tests: `npx vitest run`
- Run simulation: `node index.js --games 1000 --players 4 --ai diverse --json results/output.json`
- Single game debug: `node index.js --single --players 4 --verbose`
- Card balance analysis: `node index.js --games 1000 --card-balance`
- Card analytics report: `node index.js --games 1000 --report`
- A/B comparison: `node index.js --compare data/cards.json data/cards-modified.json`
- Lint: `npm run lint`
- Card editor: `cd editor && npm run dev` (http://localhost:5175)
- Game client: `cd client && npm run dev` (http://localhost:5173)
- Build desktop: `cd desktop && node build.js && npx electron-builder`

## File Structure

```
src/
├── engine.js           # Game loop orchestration (generator-based + sync wrappers)
├── actions.js          # Enumerate legal actions for active player
├── scoring.js          # Round-end/game-end scoring + resolveWithAI/driveWithAIs
├── poker.js            # Poker hand evaluation (with wild card optimization)
├── cards.js            # Card creation, deck building, constants
├── state.js            # Game state: players, decks, piles, display, config
├── effects.js          # Card effects: Royal attacks, Ace blocking, Major Arcana
├── effect-resolver.js  # Data-driven effect resolution, getMajorDef() lookup
├── game-controller.js  # Async GameController for browser client (yieldAll mode)
├── simulation.js       # Monte Carlo runner (used by CLI and editor worker)
├── stats.js            # Statistics aggregation and reporting
├── card-balance.js     # Card balance analysis (5 per-card metrics)
├── compare.js          # A/B config comparison mode
├── config.js           # Config loader (Node.js only — uses fs)
├── config-core.js      # Config merger (no filesystem dependency — used by editor)
├── rng.js              # Seeded PRNG (xoshiro128** with splitmix32 seed derivation)
├── history.js          # Decision history recording and replay
├── ai/
│   ├── personality.js  # Unified scoring function + all weight profiles
│   ├── base.js         # RandomAI base class (API contract for all AIs)
│   ├── awareness.js    # Shared: celestial threats, hand potential, VP urgency, buy gating
│   ├── card-value.js   # Config-aware Major Arcana valuation
│   ├── card-tracker.js # Bayesian card counting for opponent modeling
│   ├── opportunist.js  # Balanced evaluator (delegates to personality.js)
│   ├── passive.js      # Pure builder, no attacks
│   ├── builder.js      # Strong hand builder
│   ├── aggressive.js   # Disruptive attacker
│   ├── celestial.js    # Alternate win condition pursuer
│   ├── controller.js   # Defensive, protection-focused
│   ├── collector.js    # Major Arcana hoarder
│   ├── tactician.js    # Round-timing specialist
│   ├── scoring.js      # Analytical position evaluator
│   ├── mcts.js         # Monte Carlo Tree Search AI (independent system)
│   └── index.js        # Registry, factory, assignment
client/                 # React game client (Vite, @engine alias → ../src)
editor/                 # React card editor (Vite, @engine alias → ../src)
desktop/                # Electron wrapper (loads built client + editor)
data/
└── cards.json          # Card definitions and game rules (editable by designer)
test/                   # 362 tests across 15 files
scripts/                # Utility scripts
RULES.md                # Full game rules (by Danny Rafferty)
CARDS.md                # All card definitions and effects
```

## AI Architecture

All 9 heuristic AI personalities use a **shared scoring function** in `src/ai/personality.js`. Each legal action gets a continuous score, and the highest wins (with optional noise for human-like variance).

Personality comes from **weight profiles** — multipliers on each action category:

```javascript
// Example: Aggressor weights
{
  setMulti: 0.9,      // Builds realm but not obsessively
  attack: 0.7,        // Loves attacking
  buy: 0.5,           // Moderate buying
  tome: 0.3,          // Low tome priority
  noise: 0.15,        // Unpredictable
  // ... etc
}
```

Each AI file's `chooseAction()` is a one-line delegation:
```javascript
chooseAction(state, legalActions, playerIndex) {
  return chooseActionByScore(state, legalActions, playerIndex, AGGRESSOR_WEIGHTS);
}
```

All other methods (chooseDiscard, shouldBlockWithAce, shouldBlockWithKing, chooseMajorKeep, chooseMagicianSuit, etc.) remain per-AI with personality-specific logic.

The MCTS AI (`mcts.js`) is independent — it uses tree search with rollouts and doesn't share the personality system.

## Architectural Rules

- **Randomness:** All randomness MUST go through `state.rng`. Never use `Math.random()`.
- **Card definitions:** All card data lives in `data/cards.json`. The card editor UI provides visual editing.
- **State:** Single source of truth. Carries `log[]` (human-readable) and `events[]` (structured analytics).
- **AI interface:** All AIs extend `RandomAI` from `src/ai/base.js`. Decision methods must be implementable by both AI and human players (critical for the game client via GameController).
- **No tight coupling:** The engine is a clean library imported by CLI (`index.js`), client (`game-controller.js`), and editor (`simulation.js`).
- **Vite aliases:** Both `client/` and `editor/` use `@engine` → `../src` to import the engine.

### AI Decision Points

The `resolveWithAI()` function in `scoring.js` maps each decision type to an AI method:

- `chooseMajorKeep(majorCards, state)` — setup: pick 1 of 2 majors
- `chooseAction(state, legalActions, playerIndex)` — main turn action
- `chooseDiscard(state, playerIndex, numToDiscard)` — hand overflow
- `chooseRealmDiscard(state, playerIndex, numToDiscard)` — realm overflow
- `shouldBlockWithAce(state, playerIndex, action)` — reactive block
- `shouldBlockWithKing(state, playerIndex, attackCard)` — reactive block
- `chooseTomeDiscard(state, playerIndex)` — tome overflow
- `chooseWheelSources(state, playerIndex)` — Wheel of Fortune sources
- `chooseWheelKeep(cards, state)` — Wheel of Fortune pick
- `chooseMagicianSuit(state, playerIndex)` — Magician bonus
- `chooseHermitCards(state, playerIndex, eligibleIndices)` — Hermit on-play
- `chooseTowerTarget(state, playerIndex, targetPlayerIndex)` — Tower target
- `chooseCharityCard(state, playerIndex)` — Charity variant

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
- Default config ships with `aceHigh: true` (Ace ranked above King).
- Set `aceHigh: false` in `data/cards.json` for Ace-low (rank 1, below 2).

### Playing Sets to Realm
- ONE complete set OR cards that complete/repair an existing set per turn.
- Legal sets: Single, Pair, Three-of-a-Kind, Four-of-a-Kind, Five-of-a-Kind (requires wild), Straight, Flush, Straight Flush.
- Two-Pair and Full House are NOT playable as single sets (built across turns).

### Buy Phase
- Buy ONE Major Arcana by discarding UP TO 3 cards from hand to Minor discard pile.
- Display prices (default config): slot 0 (leftmost) = 9, slot 1 = 8, slot 2 (rightmost) = 7. Draw pile = 6. Discard pile = 10.

### Wild Cards
- Any Major Arcana can be played as wild into Realm IF no other Major is already there.
- Wild is EVERY suit and ANY value simultaneously — always makes strongest possible hand.
- Vulnerable to Royal attacks of ANY suit. Can be Ace-blocked when played.
- Multiple wilds possible (via Queen steal or Strength).

### Death Placement (Setup)
- Remove Death → deal 2 Majors each (keep 1, discard 1 face-up) → shuffle discards → deal face-down until 2 remain → dealt cards to BOTTOM of Major pile → shuffle Death + 2 remaining → place at very BOTTOM → deal 3 to Display from top.
- Result: 15 cards in Major deck (with 4 players), Death in bottom 3.

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
- Fool: duplicates the best opponent bonus (evaluated from Fool owner's perspective)
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
- 362 tests across 15 files

## Common Pitfalls

1. Ace value depends on `aceHigh` config — check before assuming rank 1.
2. Players draw from Minor draw pile, not discard pile.
3. Check Tome protections BEFORE resolving Royal attacks.
4. Buy payment goes to Minor discard, not Pit.
5. Pit is separate from discard. Pit cards ARE recycled between rounds (shuffled back with realm/hand/discard into new Minor deck).
6. Refill Display left-to-right after taking a card.
7. Wild cards make the BEST possible hand — try all combinations.
8. Five-of-a-Kind beats Straight Flush.
9. Cap turns per round at 50 as safety valve.
10. Death can appear during Display aging — check for it.

## Known Limitations

- Pot ties award to the first player found rather than splitting
- MCTS AI is ~200x slower than heuristic AIs (tree search with rollouts)
- AI personality weights in `personality.js` are tuned for 4-player games — 3 or 5 player balance may differ
- Wild card plays recirculate Major Arcana through the Minor deck, which can extend game length by keeping cards out of the Major deck depletion path
