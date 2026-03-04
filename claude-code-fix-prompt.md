# Claude Code Prompt — Workstream A Pre-Demo Fixes

## Context

Repo: https://github.com/RogersJohn/NewArcanaV2.0

This is a Monte Carlo simulation engine for a tarot card game called "New Arcana". Workstream A (statistical engine improvements) is complete. Before showing the tool to the game designer (Danny), we need to fix presentation bugs and add a designer-facing README.

Read the CLAUDE.md for full project context. These fixes are cosmetic/documentation — do NOT refactor engine logic.

---

## Work Items (do each as a SEPARATE commit)

### Fix 1: Duplicate Card Names in Stats Output

**File**: `src/stats.js`, line ~599

**Bug**: Card names display as "The Empress (3) (3)" because `c.name` already contains the number from `cardName()` in `cards.js` (which formats majors as `"Name (number)"`), and then `stats.js` wraps it again with `(${num})`.

**Fix**: Change line ~599 from:
```js
const name = `${c.name} (${num})`;
```
to:
```js
const name = c.name;
```

Check if `c.name` already includes the number. If it does (e.g., "The Empress (3)"), just use it directly. If `c.name` is just "The Empress" without the number, use `${c.name} (${num})`. Verify by logging a sample card's `.name` property from the cardStats object.

**Verify**: Run `node index.js --games 10 --players 4 --seed 42` and check that the MAJOR ARCANA CARD STATS table shows clean names like "The Empress (3)" not "The Empress (3) (3)".

**Commit**: `Fix duplicate card names in stats output`

---

### Fix 2: Duplicate Card Names in Card Balance Report

**File**: `src/card-balance.js`

**Bug**: Same issue may exist here. Check `printCardBalanceReport()` — the card name formatting at lines ~189, ~202, ~216, ~230, ~243 uses `[${c.number}] ${c.name}`. If `c.name` already includes `(number)`, this produces `[3] The Empress (3)`.

**Fix**: If the name already contains the number, use just `c.name.padEnd(26)`. If not, keep the `[${c.number}]` prefix. Be consistent with Fix 1.

**Verify**: Run `node index.js --games 100 --players 4 --seed 42 --card-balance` and check output formatting.

**Commit**: `Fix card name formatting in balance report`

---

### Fix 3: Create DANNY_README.md — Game Designer Quick Start

**File**: `DANNY_README.md` (new file, project root)

Create a non-technical guide for the game designer. Tone: friendly, practical, no jargon. Structure:

```markdown
# New Arcana Balance Testing Tool

## What This Does

This tool simulates thousands of games of New Arcana with AI players, then reports statistics about card balance, strategy effectiveness, and game dynamics. Use it to answer questions like:
- Is a card overpowered or underpowered?
- What happens if I change a card's VP value?
- How long do games typically last?
- Does going first give an advantage?

## Quick Start

You need Node.js installed (download from https://nodejs.org).

Open a terminal in the project folder and run:

```
npm install
node index.js --games 1000 --players 4
```

This runs 1000 games with 4 AI players and prints a summary report.

## Useful Commands

| What you want | Command |
|---|---|
| Basic 1000-game run | `node index.js --games 1000 --players 4` |
| Card balance analysis | `node index.js --games 1000 --players 4 --card-balance` |
| Detailed card report | `node index.js --games 1000 --players 4 --report` |
| Watch a single game | `node index.js --single --players 4 --verbose` |
| Reproducible results | `node index.js --games 1000 --players 4 --seed 42` |
| Save results to file | `node index.js --games 1000 --players 4 --json results/my-test.json` |
| 3 or 5 players | `node index.js --games 1000 --players 3` |

## Changing Card Values (The Important Bit)

All card definitions live in `data/cards.json`. You can change values and rerun without touching any code.

**Example: Change Celestial VP from 2 to 1**
1. Open `data/cards.json`
2. Find `"celestialVp": 2` under `"scoring"`
3. Change it to `"celestialVp": 1`
4. Run: `node index.js --games 1000 --players 4`
5. Compare results

**Example: Change a bonus card's VP award**
1. Open `data/cards.json`
2. Find the card number under `"bonusCards"` (e.g., `"1"` for The Magician)
3. Change `"vp": 1` to `"vp": 2`
4. Rerun

**A/B Comparison (test two configs side by side)**
1. Copy `data/cards.json` to `data/cards-test.json`
2. Make changes in `data/cards-test.json`
3. Run: `node index.js --compare data/cards.json data/cards-test.json`
4. This runs the same games under both configs and shows the differences

## Reading the Output

### Win Rates by AI Strategy
Shows which AI personality wins most often. If one strategy dominates (>35% in 4-player), the game mechanics may favour that playstyle too heavily.

### Card Stats Table
- **Purchased**: How often this card was bought across all games
- **By Winner**: How often the winner had this card — high = card correlates with winning
- **Bonus Rate**: For bonus cards, how often the bonus actually scored
- **As Wild**: How often this card was played as a wild in someone's Realm

### Card Balance Report (--card-balance)
Five metrics per card with anomaly flags:
- **Winner Affinity**: Does buying this card correlate with winning?
- **VP Delta**: Average VP difference between players who bought vs didn't
- **Action Effectiveness**: For action cards, how often does the action succeed vs get blocked?
- **Bonus Hit Rate**: For bonus cards, how reliably does the bonus fire?
- **Purchase Rate**: How popular is this card?

Cards flagged as **BLOCKED** have near-zero action success (opponents always block them with Aces).
Cards flagged as **OP** or **WEAK** are statistical outliers worth investigating.

## Known Limitations

- AI players are good but not perfect. They simulate reasonable play, not optimal play.
- Action cards like Wheel of Fortune and Judgement show very high block rates. This is partly because AI opponents always choose to block high-impact actions when they hold an Ace. In human play, blocking decisions would vary more.
- Sample sizes matter. 100 games gives rough trends. 1000+ games gives more reliable data.
- The tool tests card balance in the context of the current rules implementation. If a rule is ambiguous, we've made our best interpretation (documented in RULES.md).
```

Adapt this based on the actual output format — run the commands and make sure the descriptions match what the user actually sees.

**Commit**: `Add game designer quick start guide (DANNY_README.md)`

---

### Fix 4: Wheel of Fortune and Judgement Blocking Investigation

**Files**: `src/ai/*.js`, `src/card-balance.js`

**Problem**: Wheel of Fortune (10) shows 0% action success (33/33 blocked) and Judgement (20) shows 2.9% success (33/34 blocked) in the 1000-game card balance data. While the engine logic is correct (it properly checks if the blocking player holds an Ace), the AI behaviour may be too aggressive — every AI with an Ace blocks these cards unconditionally.

**Investigation steps**:
1. Check `shouldBlockWithAce` in every AI file (`aggressive.js`, `builder.js`, `controller.js`, `opportunist.js`, `tactician.js`, `collector.js`, `passive.js`, `base.js`)
2. Look for any logic that always returns `true` for `PLAY_MAJOR_ACTION` regardless of the specific card or game context
3. Check if the Celestial awareness code added in Fix #3 (FIXES.md) is causing over-blocking — specifically the `isCelestial(action.card)` check might be catching non-Celestial action cards

**If the issue is AI over-blocking**: Adjust blocking probabilities for high-impact-but-non-Celestial action cards. Wheel and Judgement are strong actions but burning an Ace to block them isn't always correct, especially early game. Consider making blocking conditional on:
- Game stage (round number)
- Number of Aces in hand (don't burn your last one on a Wheel)
- Whether the action directly threatens you vs. an opponent

**If the issue is that these cards are simply always blocked in 4-player games** (because with 3 opponents, the probability that at least one has an Ace is very high): this is a game balance insight, not a bug. In that case, add a note to `DANNY_README.md` explaining that high-player-count games naturally produce higher block rates, and suggest Danny consider this when evaluating these cards.

**Do not change the engine's blocking logic** — only adjust AI decision-making if appropriate.

**Verify**: Run `node index.js --games 1000 --players 4 --card-balance --seed 42` and check that Wheel/Judgement block rates are more realistic (some blocks, some successes). If they're still near 100%, that's fine — just make sure the DANNY_README.md covers this.

**Commit**: `Investigate and document Wheel/Judgement blocking rates`

---

### Fix 5: Regenerate Clean Results

After all fixes, regenerate the key result files:

```bash
node index.js --games 1000 --players 4 --seed 42 --json results/4players.json
node index.js --games 1000 --players 3 --seed 42 --json results/3players.json
node index.js --games 1000 --players 5 --seed 42 --json results/5players.json
node index.js --games 1000 --players 4 --seed 42 --card-balance --json results/card-balance-1000.json
node index.js --games 1000 --players 4 --seed 42 --report > results/full-report.txt
```

**Commit**: `Regenerate results after formatting fixes`

---

### Fix 6: Update CLAUDE.md Task Checklist

Add a new section under the checklist noting these fixes:

```markdown
### Pre-Demo Fixes (Workstream A Polish)
- [x] Fix duplicate card name formatting in stats and balance output
- [x] Add DANNY_README.md (game designer quick start)
- [x] Investigate and document Wheel/Judgement blocking behaviour
- [x] Regenerate clean result files
```

**Commit**: `Update CLAUDE.md with pre-demo fix checklist`

---

## Execution Rules

- Do each fix as a **separate commit** with the specified message
- Run `npx vitest run` after each fix — all 170 tests must pass
- Do NOT refactor engine logic, AI strategies, or test infrastructure
- Do NOT start any Workstream B tasks
- If any fix reveals a deeper issue, document it in a new section of FIXES.md but do NOT fix it in this session
