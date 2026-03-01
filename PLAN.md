# New Arcana Stats Engine v2 — Build Plan

## Assessment of the Old Project

The old project has ~7,000 lines across the game engine, AI, and models. Key problems:

1. **Game.js is a 1,572-line god-class** — drawing, playing, buying, discarding, scoring, AI decision-making, and statistics all crammed into one file. Untestable.
2. **Enums are wrong** — `ValueRanks` has ACE=14 AND King=14 (collision), `ProtectionCards` maps wrong (Hierophant protects Wands? No — per latest rules it's Faith=Swords, Hope=Wands, Prudence=Coins, Temperance=Cups). `CelestialCards` is missing World and Universe.
3. **Card 15 is "Greed" instead of "The Devil"** — the old project used outdated card names/effects.
4. **Draw phase is wrong** — old code draws 1-2 cards per turn. Rules say draw UP TO 6 total (hand + realm), minimum 1. This is a fundamental misimplementation.
5. **Round-end trigger is wrong** — the old code checks realm >= 5 at end of turn. Rules say: if you START your turn with 5 cards in realm, round ends. You take the marker at turn end, and it fires at the START of your NEXT turn. Other players get a full cycle.
6. **Buy phase pricing is approximate** — the display costs 7/8/9, draw pile costs 6, discard costs 10. Old code may not match.
7. **Missing Major Arcana** — Extended cards (22-26) for 6-player not implemented.
8. **Ace blocking has edge cases missed** — blocking a wild card within a set still requires playing the minor cards.
9. **No Vault variant** implemented properly.
10. **AI personalities are just multiplier bags** — they don't actually think differently about game state. A "Celestial Seeker" should fundamentally change its buy/play logic, not just multiply a number by 3.

## New Architecture

Clean separation of concerns. Each file does ONE thing.

```
new-arcana/
├── src/
│   ├── cards.js          # Card constructors, deck building, constants
│   ├── poker.js          # Hand evaluation (poker rankings)
│   ├── state.js          # GameState: immutable-ish state container
│   ├── actions.js        # All legal action enumeration
│   ├── engine.js         # Game loop: draw, play, buy, discard, round-end, game-end
│   ├── effects.js        # Major Arcana effects, Royal attacks, Ace blocking
│   ├── scoring.js        # Round-end scoring, bonus evaluation, game-end scoring
│   ├── ai/
│   │   ├── base.js       # Base AI interface and random AI
│   │   ├── aggressive.js # Attack-heavy AI
│   │   ├── builder.js    # Realm-focused poker hand builder
│   │   ├── celestial.js  # Celestial win condition pursuer
│   │   ├── controller.js # Balanced/defensive play
│   │   ├── opportunist.js# Adaptive/reactive play
│   │   └── index.js      # AI registry and factory
│   ├── simulation.js     # Monte Carlo runner
│   └── stats.js          # Statistics collection and reporting
├── test/
│   ├── poker.test.js     # Hand evaluation tests
│   ├── engine.test.js    # Game flow tests
│   ├── effects.test.js   # Card effect tests
│   └── scoring.test.js   # Scoring tests
├── index.js              # CLI entry point
└── package.json
```

## Build Order (Each Step = One Response)

### Step 1: cards.js + poker.js
Foundation. Define all 82 cards with correct names, numbers, suits, values.
Implement poker hand evaluation with wild card support.
Write tests to validate hand rankings.

### Step 2: state.js + actions.js
Game state container (players, decks, display, piles).
Legal action enumeration — what can a player do right now?

### Step 3: engine.js (core loop)
Setup, draw phase, play phase, buy phase, discard phase, turn end.
Round-end trigger logic (correct: marker-based, fires at start of next turn).
Round-end scoring. Game-end conditions (Death, Celestial win, deck exhaustion).

### Step 4: effects.js
Royal attacks (Page/Knight/Queen/King).
Ace blocking (all 4 blocking types, chain resolution).
Major Arcana actions (Chariot, Strength, Hanged Man, Tower, Wheel of Fortune, Judgement).
Major Arcana Tome effects (Temperance/Faith/Hope/Prudence suit protection, Devil hand size, Hierophant blessing, Hermit pickup).
Major Arcana bonuses (Fool duplication, Magician/High Priestess/Empress/Emperor/Justice suit counting, Lovers pair counting).
Celestial win condition.
Death immediate end.
Plague negative scoring.

### Step 5: scoring.js
Round-end: pot award, bonus card evaluation.
Game-end: Celestial 2vp each, Plague -3vp, Vault variant bonus.
Tie-breaking (highest Tome card number, then shared victory).

### Step 6: AI personas (5 distinct strategies)
- **RandomAI**: Pure random legal moves (baseline)
- **BuilderAI**: Prioritizes building strong poker hands, buys Tome bonus cards
- **AggressorAI**: Uses royals offensively, targets leaders, plays Tower/Hanged Man
- **CelestialAI**: Pursues the 3-Celestial win condition, buys/steals celestials
- **ControllerAI**: Balanced play, holds aces defensively, protects realm, buys protection Tomes
- **OpportunistAI**: Evaluates current game state and picks highest-EV action dynamically

### Step 7: simulation.js + stats.js + CLI
Monte Carlo harness: run N games, collect stats.
Statistics: win rates by persona, card performance, hand type frequency, strategy effectiveness.
CLI interface: `node index.js --games 1000 --players 4`

### Step 8: Validation & Tuning
Run simulations, verify no AI dominates (>30% in 4-player = suspect).
Verify Death timing produces 3-6 round games.
Verify card balance — no single Major Arcana should appear in >40% of winning Tomes.
Output a balance report.

## Key Design Decisions

1. **No classes for cards** — plain objects `{type:'minor', suit:'CUPS', rank:7}` or `{type:'major', num:13, name:'Death'}`. Simpler, faster, easier to clone for simulation.
2. **State is a plain object** — easy to snapshot for AI lookahead.
3. **AI decides via `chooseAction(state, legalActions)`** — clean interface, testable.
4. **No UI** — this is a headless simulation engine. Output is stats.
5. **ESM modules** — modern Node.js, no build step.
6. **Correct rules from the uploaded documents** — not the old/outdated rules the previous project used.
