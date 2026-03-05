# Claude Code Prompt — Add Tooltips to All Cards

## Context

Repo: https://github.com/RogersJohn/NewArcanaV2.0

Read the CLAUDE.md for full project context. The game client needs tooltips on all cards so players can see what each card does on hover. Currently cards show rank/suit or name/category but no rules text. This is especially important for Major Arcana where players need to know the card's effect, bonus condition, or category to make decisions.

## Requirements

### Minor Arcana Tooltips

Minor cards should show a tooltip with:
- Full name: e.g. "Knight of Swords"
- Purchase value: e.g. "Value: 12"
- For Royals (Page, Knight, Queen, King): their action text
- For Aces: their blocking action text

Use CARDS.md as the source of truth for action text. Here are the summaries:

| Card | Tooltip Action Text |
|------|-------------------|
| Ace | **Block**: Play any time to block a Royal action, Major Arcana play, or another Ace. |
| Page | **Attack**: Destroy a same-suit card in any Realm. Both go to Pit. |
| Knight | **Attack**: Steal a same-suit card from any Realm to your hand. Knight goes to Pit. |
| Queen | **Attack**: Move a same-suit card from an opponent's Realm to yours. Queen goes to Pit. |
| King | **Defend**: Block a Royal attack on your Realm. Both cards go to Pit. |
| 2-10 | No action text needed — just name and value. |

### Major Arcana Tooltips

Major cards should show a tooltip with:
- Full name and number: e.g. "7 — The Chariot"
- Category: e.g. "Action"
- Effect summary (from CARDS.md)

Here are the summaries to use:

| # | Name | Tooltip Text |
|---|------|-------------|
| 0 | The Fool | **Bonus — Round End**: Duplicate an opponent's Tome bonus card. |
| 1 | The Magician | **Bonus — Round End**: 1vp if you have MORE of a named suit than any opponent. Wild counts. No ties. |
| 2 | The High Priestess | **Bonus — Round End**: 1vp for most Wands in Realm. Ties OK. Wild not counted. |
| 3 | The Empress | **Bonus — Round End**: 1vp for most Cups in Realm. Ties OK. Wild not counted. |
| 4 | The Emperor | **Bonus — Round End**: 1vp for most Coins in Realm. Ties OK. Wild not counted. |
| 5 | The Hierophant | **Tome**: Failed bonus cards in your Tome score 1vp instead of 0. |
| 6 | The Lovers | **Bonus — Round End**: 1vp per Pair in Realm. 2vp for Two-Pair. |
| 7 | The Chariot | **Action**: Take any face-up Celestial into your Tome. Blocked by Ace. |
| 8 | Strength | **Action**: Move any Major Arcana from a Realm or Tome into your Realm as wild. Blocked by Ace. |
| 9 | The Hermit | **Tome**: On play, take all other Tome cards into hand. Bonus: 1vp if only card in Tome. |
| 10 | Wheel of Fortune | **Action**: Draw 2 Major Arcana from any source. Keep 1, Pit the other. Blocked by Ace. |
| 11 | Justice | **Bonus — Round End**: 1vp for most Swords in Realm. Ties OK. Wild not counted. |
| 12 | The Hanged Man | **Action**: Take a card from an opponent's Tome into yours. Blocked by Ace. |
| 13 | Death | **Game End**: Immediately ends the game when revealed or purchased. |
| 14 | Temperance | **Tome**: Protects Cups in your Realm from Royal attacks. Bonus: 1vp if no Cups in Realm. |
| 15 | The Devil | **Tome**: Hand size limit becomes 7. On play, draw up to 7. |
| 16 | The Tower | **Action**: Destroy a Major Arcana in every Tome larger than yours. Blocked by Ace. |
| 17 | The Star | **Celestial**: 3+ Celestials at round end = you win. Game end: 2vp each. |
| 18 | The Moon | **Celestial**: 3+ Celestials at round end = you win. Game end: 2vp each. |
| 19 | The Sun | **Celestial**: 3+ Celestials at round end = you win. Game end: 2vp each. |
| 20 | Judgement | **Action**: Take the Round-End Marker. Round ends immediately. Blocked by Ace. |
| 21 | The World | **Celestial**: 3+ Celestials at round end = you win. Game end: 2vp each. |
| 22 | Faith | **Tome**: Protects Swords from Royal attacks. Bonus: 1vp if no Swords in Realm. |
| 23 | Hope | **Tome**: Protects Wands from Royal attacks. Bonus: 1vp if no Wands in Realm. |
| 24 | The Universe | **Celestial**: 3+ Celestials at round end = you win. Game end: 2vp each. |
| 25 | Prudence | **Tome**: Protects Coins from Royal attacks. Bonus: 1vp if no Coins in Realm. |
| 26 | Plague | **Action**: Play into any player's Tome. Game end: -3vp if still in Tome. |

### All Cards

Every card in the game — whether played as wild in a Realm — should also note: "Can be played as Wild to Realm (if no other Major Arcana present)". Add this to Major Arcana tooltips.

## Implementation

### Step 1: Create a tooltip data file

Create `client/src/utils/cardTooltips.js` containing:
- A `getMinorTooltip(card)` function that returns tooltip text for minor cards
- A `getMajorTooltip(card)` function that returns tooltip text for major cards using the number-to-text mapping above
- A `getCardTooltip(card)` function that dispatches to the appropriate one

### Step 2: Add tooltip to the Card component

In `client/src/components/Card.jsx`:
- Import `getCardTooltip` from the new file
- Add a `title` attribute to the outermost `<div>` of both minor and major card renders, set to the tooltip text
- The `title` attribute gives a native browser tooltip on hover — no library needed

### Step 3: Add tooltip to opponent tome icons

In `client/src/components/OpponentSummary.jsx`, the tome icons already have a `title={card.name}` (line 23). Update this to use `getCardTooltip(card)` so opponents' tome cards also show full tooltip text.

## Style Notes

- Use the native HTML `title` attribute. No tooltip library, no custom CSS hover popups. Keep it simple.
- Tooltip text should be concise — aim for 1-2 lines max. Players will hover quickly to check effects.
- For facedown cards, no tooltip.

## Verify

Run the client (`cd client && npm run dev`), start a game, and:
1. Hover over a minor card in your hand — should see name, value, and action text for Royals/Aces
2. Hover over a Major Arcana in your hand or the Display — should see name, category, and effect
3. Hover over cards in your Realm and opponent Realms — tooltips should appear
4. Hover over opponent tome icons — should see full card description instead of just the name

## Commit

`Add tooltips to all cards showing name, value, and effect text`

## Execution Rules

- This is a UI-only change — do NOT modify any engine files
- Single commit
- No new npm dependencies — use native `title` attribute only
