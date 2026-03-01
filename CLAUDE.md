# CLAUDE.md — New Arcana Stats Engine v2

## Project Goal

Build a headless Monte Carlo simulation engine for the card game "New Arcana". The engine must:
1. Correctly implement all game rules (see RULES.md and CARDS.md in this repo)
2. Provide 6 AI personas with genuinely different strategies
3. Run batch simulations and output balance statistics

This is a REBUILD of https://github.com/NewarkCanningCompany/NewArcanaStatsEngine — that old project has fundamental rule errors and a tangled codebase. Do NOT copy code from it. Build fresh from the rule documents.

## Tech Stack

- Node.js with ESM modules (`"type": "module"` in package.json)
- No external dependencies for the engine (pure JS)
- Vitest for testing (`npm install -D vitest`)
- No UI, no web server — CLI only

## Critical Rules the Old Project Got Wrong

You MUST get these right. Read RULES.md and CARDS.md carefully.

### 1. Draw Phase
- "Handsize" = cards in hand + cards in Realm
- Draw UP TO 6 cards total (hand + realm). If you have 4, draw 2. If you have 6+, still draw exactly 1.
- The Devil changes this to 7.
- Players draw from Minor Arcana draw pile (not discard — the discard is only for looking at the top card).

### 2. Round-End Trigger (GET THIS RIGHT)
- If you END your turn with 5 cards in your Realm, take the Round-End Marker.
- The round ends when you START your NEXT turn (still holding the marker and still having 5 cards).
- If your realm drops below 5 before your next turn starts (attacks), pass the marker to the next player clockwise who has 5 cards. If nobody has 5, return marker to center.
- This means every other player gets at least one full turn after someone hits 5 cards.

### 3. Ace Value
- Ace = rank 1, BELOW a 2. Not high. Not dual.
- Lowest straight: A,2,3,4,5. Highest straight: 10,Page,Knight,Queen,King.
- Purchase value: 1.

### 4. Playing Sets to Realm
- You play ONE complete set OR cards that complete/repair an existing set.
- Legal sets: Single, Pair, Three-of-a-Kind, Four-of-a-Kind, Five-of-a-Kind (requires wild), Straight (5 consecutive, mixed suits), Flush (5 same suit, not consecutive), Straight Flush (5 consecutive, same suit).
- Two-Pair and Full House are NOT playable as single sets. They are built across two turns.
- You CAN exceed 5 cards in realm (play 3-of-a-kind when you already have 3 cards). Just discard down in discard phase.

### 5. Buy Phase
- Buy ONE Major Arcana card by discarding UP TO 3 cards from hand to Minor discard pile.
- Prices: Draw pile top (face down) = 6, Display slot 1 (leftmost) = 7, slot 2 = 8, slot 3 = 9, Discard pile top = 10.
- Payment = sum of card values. Can overpay. Royal cards worth 11-14. Major Arcana worth their printed number.
- After buying from Display: slide remaining cards right, refill leftmost slot from draw pile.

### 6. Wild Cards
- Any Major Arcana can be played as a wild card into your Realm IF no other Major Arcana is already there.
- Wild card is EVERY suit and ANY value simultaneously — always makes the strongest possible hand.
- Vulnerable to Royal attacks of ANY suit.
- Can be blocked by Ace as it's being played.
- It IS possible to have multiple wild cards (via Queen stealing one, or Strength).

### 7. Major Arcana Display Aging
- At round end: card in slot 3 → Major discard pile, slots 1&2 slide right, new card from draw pile → slot 1.
- If Death is revealed during aging, game ends immediately with no round-end scoring for that round.

### 8. The Pit
- Face-down discard pile for cards used for Actions.
- Cards in the Pit are NEVER recycled when the Minor draw pile runs out.
- When Minor draw pile empties: shuffle Minor discard pile to form new draw pile. Pit stays separate.

### 9. Card 15 is The Devil, NOT Greed
- The old project had this wrong. The Devil: Tome card, on play draw up to 7, ongoing hand size = 7.

### 10. Protection Cards (Temperance family)
- Temperance (14) = protects CUPS
- Faith (22) = protects SWORDS  
- Hope (23) = protects WANDS
- Prudence (25) = protects COINS
- Protection means: Royal attacks of that suit on cards in your Realm FAIL. The attacking card still goes to Pit.
- Wild cards are protected from that suit's Royal attacks but NOT from other suits or Major Arcana actions.

### 11. Death Placement During Setup
- Remove Death from Major deck before shuffling.
- Deal cards to players (2 Major each, keep 1, discard 1 face-up).
- Take all remaining face-up Major cards (the discards), shuffle them.
- Deal them face-down onto table until 2 remain in hand.
- Those dealt cards go to BOTTOM of Major draw pile.
- Take Death + the 2 remaining cards, shuffle those 3 together.
- Place those 3 at the very BOTTOM of the Major draw pile.
- Then deal 3 cards to Display from top of Major draw pile.

### 12. Poker Hand Rankings (strongest to weakest)
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

Ties broken by: highest card rank in the relevant grouping, then by kickers.

### 13. Setup Deal
- First round: deal 5 Minor Arcana cards per player.
- Subsequent rounds: deal 6 Minor Arcana cards per player.
- Tome cards persist between rounds. Realms are cleared.

### 14. Pot Mechanics
- Initial pot = 1vp per player.
- Each subsequent round: add (previous pot size + 1) to pot. So with 4 players: round 1 pot = 4, round 2 pot = 5, round 3 pot = 6, etc.

CORRECTION: Re-reading rules: "Place into the pot a number of victory points from the supply equal to the last round's points plus 1." So if round 1 pot was 4vp (4 players), round 2 adds 5vp to pot. If round 1 pot was won, round 2 pot = 5. If round 1 pot was NOT won (carried over), round 2 pot = 4 + 5 = 9.

### 15. Game End Conditions
1. Death revealed (purchased, drawn to display, or revealed during aging)
2. Player has 3+ Celestials in Tome/Realm/Vault at end of any round → immediate win
3. Not enough Minor Arcana cards to draw/deal even after reshuffling discard pile

## File Structure

```
src/
├── cards.js          # Card creation, deck building, constants
├── poker.js          # Hand evaluation engine
├── state.js          # Game state: players, decks, piles, display
├── actions.js        # Enumerate legal actions for active player
├── engine.js         # Game loop orchestration
├── effects.js        # Card effects: Royal attacks, Ace blocking, Major Arcana
├── scoring.js        # Round-end and game-end scoring
├── ai/
│   ├── base.js       # AI interface + RandomAI
│   ├── builder.js    # Focuses on building strong poker hands
│   ├── aggressive.js # Attacks opponents, disrupts leaders
│   ├── celestial.js  # Pursues 3-Celestial win condition
│   ├── controller.js # Defensive, holds aces, protects realm
│   ├── opportunist.js# Evaluates EV of each action dynamically
│   └── index.js      # Registry, factory, random assignment
├── simulation.js     # Monte Carlo runner
└── stats.js          # Statistics aggregation and reporting
test/
├── poker.test.js
├── engine.test.js
├── effects.test.js
└── scoring.test.js
index.js              # CLI entry
package.json
```

## Build Order

Execute these steps IN ORDER. After each step, run tests to verify before moving on.

### Step 1: package.json + cards.js + poker.js + poker.test.js

**package.json**: ESM, vitest dev dep, scripts: `"test": "vitest run"`, `"start": "node index.js"`.

**cards.js**: 
- Constants: SUITS array `['WANDS','CUPS','SWORDS','COINS']`, RANKS array `['ACE',2,3,4,5,6,7,8,9,10,'PAGE','KNIGHT','QUEEN','KING']` with numeric mapping.
- `createMinorCard(suit, rank)` → `{type:'minor', suit, rank, numericRank, isRoyal, purchaseValue}`
- `createMajorCard(number, name, category, keywords)` → `{type:'major', number, name, category, ...}`
- `createMinorDeck()` → 56 cards
- `createMajorDeck(extended=false)` → 22 or 26 cards with correct names and categories
- `MAJOR_ARCANA_DEFS` array with all 27 cards (0-26) defining name, category (tome/action/celestial/bonus), associated suit if any, etc.
- `shuffle(array)` — Fisher-Yates in-place
- Helper: `isRoyal(card)`, `isCelestial(card)`, `cardName(card)`, `purchaseValue(card)`

**poker.js**:
- `evaluateHand(cards)` → `{rank: number, type: string, description: string}` where rank is a comparable numeric score
- Must handle 1-5+ cards (fewer than 5 = only N-of-a-kind or High Card possible, no straights/flushes)
- Must handle wild cards: try all possible suit+rank assignments, return best
- Hand type hierarchy: Five-of-a-Kind (9) > Straight Flush (8) > Four-of-a-Kind (7) > Full House (6) > Flush (5) > Straight (4) > Three-of-a-Kind (3) > Two Pair (2) > Pair (1) > High Card (0)
- Within each type, break ties by relevant card ranks
- Ace = rank 1 for everything. Lowest straight: A,2,3,4,5. Highest: 10,P,Kn,Q,K.

**poker.test.js**: Test ALL hand types, tie-breaking, wild card optimization, edge cases (fewer than 5 cards, multiple wilds).

Run `npm test` — all tests must pass before Step 2.

### Step 2: state.js + actions.js

**state.js**:
- `createInitialState(numPlayers, extended=false)` → full game state object
- State shape:
```js
{
  players: [{
    name, hand: [], realm: [], tome: [], vault: [],
    vp: 0, hasRoundEndMarker: false,
    tomeProtections: new Set() // suits protected by Temperance/Faith/Hope/Prudence
  }],
  minorDeck: [], minorDiscard: [], pit: [],
  majorDeck: [], majorDiscard: [],
  display: [null, null, null], // 3 slots
  pot: 0, roundNumber: 0,
  currentPlayerIndex: 0, dealerIndex: 0,
  gameEnded: false, gameEndReason: null,
  roundEndMarkerHolder: -1, // player index or -1
  config: { extended, numPlayers, handSizeLimit: 6 }
}
```
- `cloneState(state)` → deep copy for AI lookahead (use structuredClone or manual)
- `getHandSize(player)` → player.hand.length + player.realm.length
- `getEffectiveHandLimit(player)` → 6, or 7 if Devil in tome

**actions.js**:
- `getLegalActions(state, playerIndex)` → array of action objects
- Action types:
  - `{type:'PLAY_SET', cards: [...], description}` — play a set to realm
  - `{type:'PLAY_ROYAL', card, target: {playerIndex, realmIndex}, description}` — Royal attack
  - `{type:'PLAY_MAJOR_TOME', card, description}` — play Major to Tome
  - `{type:'PLAY_MAJOR_ACTION', card, targets, description}` — play Major for Action effect
  - `{type:'PLAY_WILD', card, withCards: [...], description}` — play Major as wild to Realm
  - `{type:'BUY', source: 'draw'|'display0'|'display1'|'display2'|'discard', payment: [...], description}`
  - `{type:'PASS', description}` — do nothing
- Must correctly enumerate what sets are playable given current hand + realm
- Must correctly enumerate buy options given hand values
- Must correctly enumerate valid Royal attack targets (same suit, Queen=opponents only)

No tests needed for actions.js yet — it'll be tested through engine tests.

### Step 3: engine.js + engine.test.js

**engine.js**:
- `setup(state)` — mutates state: shuffle decks, deal cards, place Death, fill display, set initial pot
- `playGame(state, ais)` — main loop: rounds until game ends. Returns final state.
- `playRound(state, ais)` — deal cards, take turns, handle round-end
- `playTurn(state, ais, playerIndex)` — draw phase, play/buy phase (AI decides), discard phase
- `drawPhase(state, playerIndex)` — draw up to handsize limit (6 or 7), min 1
- `discardPhase(state, playerIndex, ai)` — AI chooses which cards to discard if over limit. Also handle realm overflow (>5 cards).
- `handleRoundEnd(state)` — score round, age display, check Death, reset realms, deal new cards
- `checkGameEnd(state)` — Death revealed, Celestial win, deck exhaustion

**engine.test.js**: 
- Test setup produces correct state
- Test draw phase draws correct number
- Test round-end marker logic (5 cards → take marker → fires next turn start)
- Test a full game runs to completion without errors using RandomAI
- Test Death placement is in bottom 3 of Major deck

### Step 4: effects.js + effects.test.js

**effects.js**:
- `resolveRoyalAttack(state, attackerIndex, card, targetPlayerIndex, targetRealmIndex, ais)` — handle Page/Knight/Queen with King blocking and Ace blocking
- `resolveAceBlock(state, blockerIndex, targetAction)` — handle Ace chain resolution
- `resolveMajorAction(state, playerIndex, card, targets, ais)` — dispatch to specific Major effect handlers
- Individual handlers: `resolveChariot`, `resolveStrength`, `resolveHangedMan`, `resolveTower`, `resolveWheelOfFortune`, `resolveJudgement`, `resolvePlague`
- `applyTomeEffect(state, playerIndex, card)` — handle on-play effects (Hermit, Devil, Temperance family)
- `checkDeathRevealed(state)` — check if Death is now face-up anywhere, trigger game end
- `shouldBlockWithAce(state, ais, action)` — ask each AI (except actor) if they want to block with an Ace
- `shouldBlockWithKing(state, ais, defenderIndex, attackCard)` — ask defender AI if they want to block with King

**effects.test.js**:
- Test each Royal attack type
- Test King blocking a Royal
- Test Ace blocking a Royal, a Major action, a wild card play, and another Ace
- Test Temperance protecting Cups
- Test Strength moving a Major Arcana to Realm
- Test Chariot stealing a Celestial

### Step 5: scoring.js + scoring.test.js

**scoring.js**:
- `scoreRoundEnd(state)` → mutates state, awards pot and bonuses
  - Award pot to player with best poker hand (using poker.js evaluateHand)
  - Evaluate all bonus cards in all Tomes (Fool, Magician, High Priestess, Empress, Emperor, Hierophant, Lovers, Hermit, Justice, Temperance/Faith/Hope/Prudence)
  - Remember: bonuses only fire if player has ≥1 card in Realm
  - Hierophant: failed bonuses score 1vp
- `scoreGameEnd(state)` → mutates state, awards game-end bonuses
  - Celestials: 2vp each (in Tome, Realm, or Vault)
  - Plague: -3vp if in Tome
  - Vault variant: best vault hand = bonus vp equal to player count
- `checkCelestialWin(state)` → player index or -1
- `resolveBonus(state, playerIndex, card)` → vp earned from one bonus card
- `resolveFool(state, playerIndex)` → duplicate best opponent bonus

**scoring.test.js**:
- Test pot awarded to best hand
- Test each bonus card scores correctly
- Test Hierophant blesses failed bonuses
- Test Celestial win condition
- Test Fool duplication
- Test game-end Celestial 2vp scoring

### Step 6: AI Personas

Each AI implements: 
```js
{
  name: string,
  chooseAction(state, legalActions, playerIndex): action,
  chooseDiscard(state, playerIndex, numToDiscard): cardIndices,
  shouldBlockWithAce(state, playerIndex, action): boolean,
  shouldBlockWithKing(state, playerIndex, attackCard): boolean,
  chooseTomeDiscard(state, playerIndex): tomeIndex,
  chooseMajorKeep(majorCards): index // during setup, pick 1 of 2
}
```

**base.js — RandomAI**: All choices random from legal options. This is the baseline.

**builder.js — BuilderAI**: 
- Prioritizes playing strong sets to Realm
- Evaluates which hand in its current cards would score highest
- Buys Tome bonus cards that match its current suit distribution
- Holds aces for defense, uses Kings defensively
- Never attacks unless significantly behind
- Discards cards that don't contribute to its best hand

**aggressive.js — AggressorAI**:
- Targets the player with the most VP or strongest Realm
- Uses Pages to destroy key cards, Knights to steal, Queens to take
- Buys Tower and Hanged Man when available
- Plays Plague into opponents' Tomes
- Uses aces to block opponents' plays rather than defensively
- Builds realm as secondary priority

**celestial.js — CelestialAI**:
- Primary goal: acquire 3 Celestials
- Buys any available Celestial aggressively
- Uses Chariot to steal Celestials
- Plays Celestials to Tome immediately
- Builds realm as backup plan
- Very protective of Tome (blocks attacks with Aces)

**controller.js — ControllerAI**:
- Defensive and methodical
- Buys Temperance/Faith/Hope/Prudence to protect Realm
- Always holds at least one Ace if possible
- Builds consistent hands (pairs → three-of-a-kind → full house)
- Avoids wild cards (too vulnerable)
- Buys Devil for hand size advantage

**opportunist.js — OpportunistAI**:
- Evaluates expected value of every legal action
- Uses simple heuristic scoring:
  - Realm strength improvement
  - VP potential from bonuses
  - Disruption value against leader
  - Card advantage
- Picks highest EV action each turn
- Adapts strategy based on game state (attacks when behind, builds when ahead)

**ai/index.js**: Registry. `getAI(name)`, `getRandomAI()`, `getAllAINames()`, `createAIPool(numPlayers)` (assigns diverse AIs).

### Step 7: simulation.js + stats.js + index.js

**simulation.js**:
- `runSimulation(config)` → results object
  - config: `{games: 1000, players: 4, extended: false, aiAssignment: 'diverse'|'random'|'specific'}`
  - For 'diverse': cycle through AI types so each gets roughly equal representation
  - Run N games, collect per-game results
  - Handle errors gracefully (log and skip broken games)

**stats.js**:
- Collect per-game: winner AI type, winning hand type, rounds played, VP distribution, Major Arcana in winning Tomes, Celestial wins vs VP wins
- Aggregate across all games:
  - **AI win rates** by persona (with 95% confidence intervals)
  - **Hand type frequency** (what hands win rounds)
  - **Major Arcana power ranking** (which cards appear most in winning games)
  - **Card purchase frequency** (which Major cards get bought most)
  - **Celestial win rate** (how often does Celestial victory happen)
  - **Average game length** (rounds)
  - **VP distribution** (mean, median, stddev of final scores)
  - **First-player advantage** (does position matter?)
  - **Strategy effectiveness** (each AI's average VP even when losing)
- Output as formatted console report AND as JSON file

**index.js**:
```
Usage: node index.js [options]
  --games N       Number of games (default: 1000)
  --players N     Number of players (default: 4)  
  --extended      Use 6-player card set
  --ai TYPE       AI assignment: diverse|random|all-random|all-builder|etc
  --verbose       Log individual games
  --json FILE     Output stats as JSON
  --single        Run one game with verbose logging
```

### Step 8: Validation Run

After all code is written and tests pass:

1. Run `npm test` — all tests green
2. Run `node index.js --games 100 --verbose` — verify games complete without errors
3. Run `node index.js --games 1000 --players 4` — full simulation
4. Check results:
   - No AI should win >35% of 4-player games (expected ~25% if balanced)
   - If one AI wins >35%, that strategy is overpowered OR others are underpowered
   - Games should average 3-6 rounds
   - Celestial wins should be <15% of games (it's an alternate path, not dominant)
   - Death should be the most common game-end trigger
5. Run `node index.js --games 1000 --players 3` and `--players 5` for comparison
6. Save output to `results/` directory

## Code Style

- Plain objects, not classes (except AI classes which need method dispatch)
- Functions are pure where possible (state in, state out)
- Mutation is OK for the actual game state during play (performance matters for Monte Carlo)
- No console.log in library code — use a logger that can be silenced
- JSDoc comments on all public functions
- Keep files under 400 lines. If a file exceeds this, split it.

## Testing Philosophy

- Test the tricky rules: round-end marker passing, Ace blocking chains, wild card optimization, Death placement
- Don't test obvious stuff (does shuffle randomize? yes.)
- Each test should verify a RULE, not an implementation detail
- Use descriptive test names: `"Ace blocks Queen attack and both go to Pit"`

## Common Pitfalls to Avoid

1. Don't make Ace high. Ace = 1, always.
2. Don't let players draw from Minor discard pile freely — they draw from the draw pile. (The top of Minor discard is visible but the rules say "draw from deck". The discard pile is used for seeing what was discarded.)
3. Don't forget to check Tome protections before resolving Royal attacks.
4. Don't forget that buying a card means discarding payment to Minor discard pile, not Pit.
5. Don't forget that the Pit is separate from discard and never recycled.
6. Don't forget to refill Display left-to-right after taking a card from it.
7. Don't forget that wild cards make the BEST possible hand — you must try all combinations.
8. Don't forget Five-of-a-Kind beats Straight Flush (it requires a wild card, so it's rarer).
9. Don't let AI play indefinitely — cap turns per round at 50 as a safety valve.
10. Death can appear during Display aging at round end — check for it.
11. When calculating if someone has "more" vs "most" of a suit for bonuses: Magician requires strictly MORE (no ties). High Priestess/Empress/Emperor/Justice allow ties.

## Git

- `git init` at start
- Commit after each step with message like "Step 1: cards + poker evaluation"
- Push if remote is configured
