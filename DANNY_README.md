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

### Strategy Effectiveness (avg VP)
Average victory points per strategy, regardless of whether they won. Useful for seeing which strategies consistently score well even when they don't win.

### Game End Reasons
How games typically end:
- **death_purchased** — a player bought the Death card
- **death_revealed** — Death appeared in the display during aging
- **celestial_win** — a player collected 3 Celestials for an instant win

### Card Stats Table
- **Purchased**: How often this card was bought across all games
- **In Winner Tome**: How often the winner had this card — high = card correlates with winning
- **Bonus Rate**: For bonus cards, how often the bonus actually scored
- **Avg Bonus VP**: Average VP earned when the bonus fires
- **Used as Wild**: How often this card was played as a wild in someone's Realm

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
- In 4-player games, high-impact action cards like Wheel of Fortune and Judgement tend to get blocked very often. With 3 opponents, the chance that at least one holds an Ace is high, and the AI will almost always use it to block powerful actions. In human play, blocking decisions would vary more. Consider testing with 3 players to see lower block rates.
- Sample sizes matter. 100 games gives rough trends. 1000+ games gives more reliable data.
- The tool tests card balance in the context of the current rules implementation. If a rule is ambiguous, we've made our best interpretation (documented in RULES.md).
