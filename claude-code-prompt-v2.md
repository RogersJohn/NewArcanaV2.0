## Task

You are working on the NewArcanaV2.0 card game simulator at `/home/claude/repo` (or wherever the repo is cloned).

### Context

We just completed AI improvements to fix near-100% block rates on Judgement (card 20) and Wheel of Fortune (card 10). The root cause was that 4 of 5 AI personalities never chose to play these cards as actions. The fixes are already committed:

**Existing AI fixes (already in code):**
- Aggressor: replaced `[7,8,12,16,26]` filter with all action cards + priority ordering
- Builder: added action card fallback (Priority 5) before PASS
- Controller: added action card fallback (Priority 7) before PASS  
- Celestial: added Wheel of Fortune as Priority 2b after Chariot
- Opportunist: dynamic Judgement scoring (50 if wouldWinPot, 8 otherwise), Wheel bumped to 30, now blocks Judgement/Wheel

**New AIs (already in code):**
- Tactician (`src/ai/tactician.js`): round-timing specialist, strategic Judgement, targets marker holders
- Collector (`src/ai/collector.js`): Major Arcana hoarder, Wheel as top priority, bonus-aware Tome evaluation

**Before metrics (from `results/card-balance-1000.json`):**
- Wheel of Fortune: 0 successful plays, 33 blocked, 0% success rate
- Judgement: 1 successful play, 33 blocked, 2.9% success rate

**After metrics (from 200-game diagnostic):**
- Wheel: 158 action plays (36.5% of available turns)
- Judgement: 46 action plays (7.5% of available turns)
- Block rates now normal (~10% for Wheel, ~30% for Judgement)

### What to do

#### Step 1: Run fresh card-balance simulation

Run `scripts/card-balance.js` or equivalent to produce a new 1000-game card-balance analysis. Save the output to `results/card-balance-post-ai-fix.json`. If the script doesn't exist or doesn't work, look at how `index.js` runs card-balance mode and replicate it.

Also run a 200-game diagnostic that captures per-AI breakdown of Judgement/Wheel usage. Save this as `results/ai-coverage-diagnostic.json`. Here's the diagnostic logic (adapt as needed):

```javascript
// For each game, wrap each AI's chooseAction to track:
// - How many turns each card (10, 20) was available as PLAY_MAJOR_ACTION
// - How many times it was chosen as ACTION vs WILD vs something else
// - Break down by AI type
// Also wrap shouldBlockWithAce to track block decisions for cards 10 and 20
```

#### Step 2: Generate the HTML report

Create a polished HTML report at `results/card-balance-report.html` styled identically to the uploaded reference file (`NewArcana_Celestial_VP_Comparison.html`). Copy its exact CSS, font imports, Chart.js setup, and design system (dark theme, --bg/#0c0e12, DM Sans/DM Serif Display/JetBrains Mono fonts, card/kpi/callout components).

The report should contain these sections:

**Hero section:**
- Title: "New Arcana — AI & Card Balance Report"
- Subtitle referencing the AI fixes and new personalities
- Badge: "POST-FIX ANALYSIS: 7 AI Personalities"
- Hero stats: total games, AI types (7), cards analyzed

**Section 1: "The Judgement & Wheel Fix"**
- KPI row: before/after success rates for Wheel and Judgement
- Grouped bar chart: before vs after action effectiveness for ALL action cards (Chariot, Strength, Wheel, Hanged Man, Tower, Judgement, Plague)
- Callout explaining the root cause (AIs never selected these cards) and the fix

**Section 2: "AI Coverage Matrix"**  
- Table showing per-AI-type breakdown: for each of the 7 active AIs, show how often they play each action card type (as action vs wild vs not played). Use the diagnostic data.
- Highlight which AIs are the primary exercisers of each mechanic
- Bar chart: action plays per AI type

**Section 3: "Full Card Balance"**
- Winner Affinity: horizontal bar chart (same style as the reference file's affinity chart)
- VP Delta: bar chart of holder vs non-holder VP difference
- Action Effectiveness: all action cards with success rates (the key improved metric)
- Tome Bonus Hit Rate: bar chart
- Purchase Rate: bar chart showing bought vs aged-off

**Section 4: "Remaining Issues"**
- Callout blocks identifying any cards that still show anomalous behavior
- Note which mechanics still lack coverage (if any)
- Recommendations for further tuning

**Section 5: "Recommendation"**
- Summary cards (like the 2VP/1VP/0VP cards in the reference) comparing old 5-AI pool vs new 7-AI pool
- Final callout with verdict

### Design requirements
- Match the reference HTML file's visual style exactly (copy CSS verbatim from `results/NewArcana_Celestial_VP_Comparison.html` or use these vars):
```css
:root{--bg:#0c0e12;--surface:#14171e;--surface2:#1a1e28;--border:#2a3040;--text:#e2e6ee;--text-dim:#8892a4;--text-muted:#5a6478;--accent:#6c9cff;--accent2:#a78bfa;--green:#34d399;--red:#f87171;--amber:#fbbf24;--orange:#fb923c;--radius:12px}
```
- Fonts: DM Sans, DM Serif Display, JetBrains Mono (Google Fonts)
- All charts use Chart.js 4.x loaded from CDN: `https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js`
- Single self-contained HTML file, no external dependencies beyond CDN
- Use real data from the simulation runs — do NOT fabricate numbers
- Color palette for charts: blue=#6c9cff, purple=#a78bfa, green=#34d399, red=#f87171, amber=#fbbf24, orange=#fb923c, slate=#64748b

### Before data (from results/card-balance-1000.json, for comparison)
```
Action Effectiveness (BEFORE - 5 AI pool):
Wheel of Fortune:  played=0    aceBlocked=33   success=0.0%
Judgement:         played=1    aceBlocked=33   success=2.9%  
Hanged Man:        played=233  aceBlocked=135  success=63.3%
Strength:          played=273  aceBlocked=151  success=64.4%
Chariot:           played=542  aceBlocked=216  success=71.5%
Tower:             played=311  aceBlocked=39   success=88.9%
```

### File outputs
1. `results/card-balance-post-ai-fix.json` — raw simulation results  
2. `results/ai-coverage-diagnostic.json` — per-AI card usage breakdown
3. `results/card-balance-report.html` — the polished HTML report
