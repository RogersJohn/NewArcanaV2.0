# FIXES.md — New Arcana Stats Engine v2.0 Verified Bug Fixes

## Corrections From Initial Review

After running game traces and direct code testing, several issues from the initial code review were WRONG:

- **Flush detection IS implemented** (lines 107-125 of actions.js). Initial review missed this due to truncated file view.
- **Set completion IS implemented** (lines 132-163 of actions.js). Same issue.
- **Discard phase works correctly** — direct testing confirms hand sizes are reduced to the limit.
- **Hand sizes >6 between rounds are rules-legal** — players keep hand cards between rounds and receive 6 more on deal.
- **Death timing after buy-triggered display refill is correct** — game ends immediately, log ordering is just confusing.

The REMAINING verified issues are below.

## Instructions

Read this entire file before making changes. Fix each issue in numbered order. Run `npm test` after each fix. Commit after each with message `Fix #N: <description>`.

After all fixes, run:
```
node index.js --games 1000 --players 4 --json results/post-fix-4players.json
node index.js --games 1000 --players 3 --json results/post-fix-3players.json
node index.js --games 1000 --players 5 --json results/post-fix-5players.json
```

---

## Fix #1: Randomize AI Seat Assignment in Diverse Mode

**File**: `src/ai/index.js`

**Problem**: `createAIPool` always assigns AIs in the same deterministic order: [Builder, Aggressor, Celestial, Controller] for 4 players. Position_0 is ALWAYS Builder, position_2 is ALWAYS Celestial. The "position advantage" stats just mirror AI win rates. Also, Opportunist never gets a seat in 4-player games because `i % 5` only maps to indices 0-3.

**Fix**: Shuffle available AI names before selecting, then shuffle seat order:

```js
import { shuffle } from '../cards.js';

export function createAIPool(numPlayers) {
  const nonRandom = AI_NAMES.filter(n => n !== 'random' && n !== 'passive');
  const shuffledNames = shuffle([...nonRandom]);
  const ais = [];
  for (let i = 0; i < numPlayers; i++) {
    const aiName = shuffledNames[i % shuffledNames.length];
    ais.push(getAI(aiName));
  }
  shuffle(ais);
  return ais;
}
```

---

## Fix #2: Fix Hierophant Scoring — Must Fire With Empty Realm

**File**: `src/scoring.js`

**Problem**: `scoreRoundEnd` has `if (player.realm.length === 0) continue;` which skips ALL bonus evaluation for players with empty realms. The Hierophant (card 5) says "Bonus cards in your Tome score 1vp when NOT eligible to score" — this explicitly covers the empty-realm case.

**Fix**: Restructure the scoring loop so Hierophant blessing is evaluated even when realm is empty:

```js
export function scoreRoundEnd(state, ais) {
  if (state.roundEndMarkerHolder !== -1) {
    awardPot(state);
  }

  for (let pi = 0; pi < state.players.length; pi++) {
    const player = state.players[pi];
    const hasHierophant = player.tome.some(c => c.type === 'major' && c.number === 5);
    const hasRealmCards = player.realm.length > 0;

    for (const tomeCard of player.tome) {
      if (tomeCard.type !== 'major') continue;
      if (!isBonusCard(tomeCard)) continue;
      if (tomeCard.number === 5) continue; // Hierophant itself not a bonus

      if (hasRealmCards) {
        const bonus = resolveBonus(state, pi, tomeCard, ais);
        if (bonus > 0) {
          player.vp += bonus;
          log(state, `${player.name} earns ${bonus}vp from ${cardName(tomeCard)}`);
          recordEvent(state, 'BONUS_SCORED', {
            cardNumber: tomeCard.number, cardName: tomeCard.name,
            player: pi, vp: bonus, hierophant: false,
          });
        } else if (hasHierophant) {
          player.vp += 1;
          log(state, `${player.name} earns 1vp from Hierophant (failed ${cardName(tomeCard)})`);
          recordEvent(state, 'BONUS_SCORED', {
            cardNumber: tomeCard.number, cardName: tomeCard.name,
            player: pi, vp: 1, hierophant: true,
          });
        } else {
          recordEvent(state, 'BONUS_FAILED', {
            cardNumber: tomeCard.number, cardName: tomeCard.name, player: pi,
          });
        }
      } else {
        if (hasHierophant) {
          player.vp += 1;
          log(state, `${player.name} earns 1vp from Hierophant (no realm, ${cardName(tomeCard)})`);
          recordEvent(state, 'BONUS_SCORED', {
            cardNumber: tomeCard.number, cardName: tomeCard.name,
            player: pi, vp: 1, hierophant: true,
          });
        } else {
          recordEvent(state, 'BONUS_FAILED', {
            cardNumber: tomeCard.number, cardName: tomeCard.name, player: pi,
          });
        }
      }
    }

    // Hermit bonus (1vp if only card in Tome, requires realm cards)
    if (hasRealmCards) {
      const hermit = player.tome.find(c => c.type === 'major' && c.number === 9);
      if (hermit && player.tome.length === 1) {
        player.vp += 1;
        log(state, `${player.name} earns 1vp from Hermit (only card in Tome)`);
        recordEvent(state, 'BONUS_SCORED', {
          cardNumber: 9, cardName: 'The Hermit', player: pi, vp: 1, hierophant: false,
        });
      }
    }
  }

  state.roundEndMarkerHolder = -1;
  for (const p of state.players) p.hasRoundEndMarker = false;
}
```

**New tests** in `test/scoring.test.js`:

```js
test('Hierophant blesses bonus cards when realm is empty', () => {
  // Player has Hierophant (5) + Magician (1) in Tome, 0 realm cards
  // scoreRoundEnd should give 1vp for the Magician via Hierophant
});

test('Without Hierophant, bonus cards score 0 with empty realm', () => {
  // Player has Magician (1) in Tome, 0 realm cards → 0vp
});
```

---

## Fix #3: Add Celestial Awareness to All Non-Celestial AIs

**Files**: `src/ai/awareness.js` (new), `src/ai/builder.js`, `src/ai/aggressive.js`, `src/ai/controller.js`, `src/ai/opportunist.js`

**Problem**: CelestialAI wins 45.6% of 4-player games. No other AI counters the Celestial win condition. Nobody steals Celestials from Tomes, nobody destroys them with Tower, nobody blocks Celestials being played to Tome.

**Fix**: Create `src/ai/awareness.js`:

```js
import { isCelestial } from '../cards.js';

export function checkCelestialThreat(state, playerIndex) {
  let maxCelestials = 0;
  let threatPlayer = -1;
  for (let pi = 0; pi < state.players.length; pi++) {
    if (pi === playerIndex) continue;
    const count = [...state.players[pi].tome, ...state.players[pi].realm, ...state.players[pi].vault]
      .filter(c => isCelestial(c)).length;
    if (count > maxCelestials) { maxCelestials = count; threatPlayer = pi; }
  }
  return { threatening: maxCelestials >= 2, threatPlayer, celestialCount: maxCelestials };
}

export function findCelestialDisruption(state, playerIndex, legalActions, threatPlayer) {
  // Hanged Man targeting Celestial in threat's Tome
  for (const a of legalActions) {
    if (a.type === 'PLAY_MAJOR_ACTION' && a.card?.number === 12 && a.targets?.playerIndex === threatPlayer) {
      const target = state.players[threatPlayer].tome[a.targets.cardIndex];
      if (target && isCelestial(target)) return a;
    }
  }
  // Tower
  for (const a of legalActions) {
    if (a.type === 'PLAY_MAJOR_ACTION' && a.card?.number === 16) return a;
  }
  // Strength targeting threat's Celestial
  for (const a of legalActions) {
    if (a.type === 'PLAY_MAJOR_ACTION' && a.card?.number === 8 && a.targets?.playerIndex === threatPlayer) return a;
  }
  // Chariot to steal a Celestial
  for (const a of legalActions) {
    if (a.type === 'PLAY_MAJOR_ACTION' && a.card?.number === 7) return a;
  }
  return null;
}
```

In each of `builder.js`, `aggressive.js`, `controller.js`, `opportunist.js`, add at the top of `chooseAction`:

```js
import { checkCelestialThreat, findCelestialDisruption } from './awareness.js';

// First priority in chooseAction:
const threat = checkCelestialThreat(state, playerIndex);
if (threat.threatening) {
  const disruption = findCelestialDisruption(state, playerIndex, legalActions, threat.threatPlayer);
  if (disruption) return disruption;
}
```

Also add to `shouldBlockWithAce` in all four AIs:

```js
import { isCelestial } from '../cards.js';

// In shouldBlockWithAce, add this check:
if (action.type === 'PLAY_MAJOR_TOME' && action.card && isCelestial(action.card)) {
  return true;
}
```

---

## Fix #4: Improve Verbose Logging for Auditability

**File**: `src/engine.js`, `src/effects.js`

**Problem**: Game traces cannot be audited because:
- Ace blocks don't show what action was blocked
- King blocks don't show what attack was blocked
- Discards from hand aren't logged

**Fix**:

In `checkAceBlock` (both engine.js and effects.js), improve the log:
```js
log(state, `${state.players[pi].name} blocks [${action.description || action.type}] with ${cardName(ace)}!`);
```

In `discardPhase`, add per-card logging:
```js
// After splicing a card from hand:
log(state, `${player.name} discards ${cardName(card)} from hand`);
```

In `shouldBlockWithKing` resolution in effects.js, log what's being blocked:
```js
log(state, `${defender.name} blocks [${cardName(card)} attack on ${cardName(targetCard)}] with King! Both go to Pit`);
```

---

## Fix #5: Prune Wild Card Action Combinatorics

**File**: `src/actions.js`

**Problem**: `addWildActions` generates every combination of Major card with 1-4 Minors. With 6 minors, that's 56 actions per Major. Most are equivalent.

**Fix**: Only generate wild alone + top 3 companion sets by hand strength:

```js
import { evaluateHand, compareHands } from './poker.js';

// Replace companion-generation block in addWildActions:
const minors = player.hand.filter(c => c.type === 'minor');
if (minors.length > 0) {
  let bestCombos = [];
  for (let n = 1; n <= Math.min(4, minors.length); n++) {
    const combos = combinations(minors, n);
    for (const combo of combos) {
      const testRealm = [...player.realm, ...combo, { type: 'major' }];
      const score = evaluateHand(testRealm);
      bestCombos.push({ combo, score });
    }
  }
  bestCombos.sort((a, b) => compareHands(b.score, a.score));
  bestCombos = bestCombos.slice(0, 3);
  for (const { combo } of bestCombos) {
    actions.push({
      type: 'PLAY_WILD', card, withCards: combo,
      description: `Play ${cardName(card)} as wild with ${combo.map(cardName).join(', ')}`,
    });
  }
}
```

Also prune buy actions to top 3 cheapest per source:
```js
payments.sort((a, b) =>
  a.reduce((s, c) => s + c.purchaseValue, 0) - b.reduce((s, c) => s + c.purchaseValue, 0)
);
const topPayments = payments.slice(0, 3);
```

---

## Fix #6: Add Major Arcana Card-Level Statistics to Report

**File**: `src/stats.js`

**Problem**: Per-card event data is collected but never aggregated or reported.

**Fix**: Add `computeCardStats(results)` that aggregates card events across all games. Include in `aggregateStats` return value. Add a card stats section to `printReport` sorted by winner affinity (purchasedByWinner / purchased):

```
--- MAJOR ARCANA CARD STATS ---
  Card                | Bought | By Winner | To Tome | Bonus Rate | As Wild
  The Devil (15)      |   312  |    89     |   245   |    N/A     |    12
  Temperance (14)     |   198  |    71     |   178   |   68%      |     8
  ...
```

---

## Fix #7: Fix Buy Log Ordering When Death Appears in Display Refill

**File**: `src/engine.js`

**Problem**: When buying from Display triggers a refill that reveals Death, the log shows "Death revealed!" before "Player buys X". Confusing for auditing.

**Fix**: In `executeBuy`, log the purchase BEFORE refilling:

```js
} else if (source.startsWith('display')) {
  const slot = parseInt(source.slice(-1));
  bought = state.display[slot];
  state.display[slot] = null;
  log(state, `${player.name} buys ${cardName(bought)} from ${source}`);
  recordEvent(state, 'CARD_PURCHASED', { ... });
  refillDisplay(state, slot);
  checkDeathInDisplay(state);
}
```

Remove the duplicate log/recordEvent after the `if (bought)` block for display sources.

---

## Pre-Demo Investigation: Wheel/Judgement Blocking Rates

**Investigated**: Whether Wheel of Fortune (10) and Judgement (20) have unreasonably high block rates.

**Finding**: Current blocking rates are reasonable (1000 games, 4 players, seed 42):
- Wheel of Fortune: 87.4% success (62 blocked / 494 total)
- Judgement: 51.4% success (35 blocked / 72 total)

**Analysis**: Most AI types (Builder, Controller, Opportunist, Scoring, Passive) do NOT block action cards. Only Aggressor (40%), Tactician (30-40%), Collector (25-35%), and Random (20%) attempt to block. Judgement has a higher block rate because it's a high-impact action that the AIs prioritize. The compound probability of at least one of 3 opponents having an Ace and choosing to block explains the moderate rates. No code changes needed — documented in DANNY_README.md Known Limitations section.

---

## Verification

After all fixes:

1. `npm test` — all pass
2. `node index.js --single` — verify Ace blocks show targets, discards logged, log order correct
3. Run 1000-game simulations for 3, 4, 5 players and save to `results/`

**Expected outcomes:**
- No AI wins >35% of 4-player games
- CelestialAI win rate drops from 45.6%
- Position win rates roughly equal (~25% each for 4 players)
- Card-level stats in report

Commit results: `Post-fix simulation results`
