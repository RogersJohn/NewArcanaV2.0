# Claude Code Prompt — Fix ActionChoose Type Name Mismatches

## Context

Repo: https://github.com/RogersJohn/NewArcanaV2.0

Read the CLAUDE.md for full project context. The action selection UI in the game client uses wrong type names that don't match the engine's action types. This causes actions to be miscategorised, misdescribed, and in some cases unclickable.

## The Bug

**File**: `client/src/components/actions/ActionChoose.jsx`

The `categorizeActions` function and `describeAction` function use type names that don't match the engine. The engine generates actions in `src/actions.js` with these types:

| Engine Type | UI Checks For | Result |
|-------------|--------------|--------|
| `PLAY_ROYAL` | `ATTACK`, `ROYAL_ATTACK` | Falls to "Other" — misdescribed |
| `PLAY_MAJOR_TOME` | `PLAY_MAJOR_TO_TOME` | Falls to "Other" — misdescribed |
| `PLAY_MAJOR_ACTION` | `PLAY_MAJOR` | Falls to "Other" — misdescribed |
| `BUY` | `BUY_MAJOR` | Falls to "Other" — misdescribed |
| `PLAY_SET` | `PLAY_SET` | Correct |
| `PLAY_WILD` | `PLAY_WILD` | Correct |
| `PASS` | `PASS` | Correct |

Additionally, `describeAction` tries to access properties that don't exist on the engine's action objects (e.g. `action.targetPlayer`, `action.targetCard`, `action.cost`). The engine actions all have a `description` field that already contains a human-readable description.

## The Fix

Replace both `categorizeActions` and `describeAction` to use the correct engine type names and use the action's built-in `description` field:

```js
function categorizeActions(actions) {
  const categories = {
    pass: [],
    play: [],
    attack: [],
    major: [],
    wild: [],
    buy: [],
    other: [],
  };

  for (const action of actions) {
    const t = action.type;
    if (t === 'PASS') categories.pass.push(action);
    else if (t === 'PLAY_SET') categories.play.push(action);
    else if (t === 'PLAY_ROYAL') categories.attack.push(action);
    else if (t === 'PLAY_MAJOR_TOME' || t === 'PLAY_MAJOR_ACTION') categories.major.push(action);
    else if (t === 'PLAY_WILD') categories.wild.push(action);
    else if (t === 'BUY') categories.buy.push(action);
    else categories.other.push(action);
  }

  return categories;
}

function describeAction(action) {
  // All engine actions have a description field — use it
  if (action.description) return action.description;

  // Fallback for any action without a description
  switch (action.type) {
    case 'PASS':
      return 'Pass (do nothing)';
    default:
      return action.type;
  }
}
```

## Verify

Run the client (`cd client && npm run dev`), start a game, and confirm:

1. **Royal attacks** appear under the "Attack" category with descriptions like "KNIGHT of CUPS attacks 5 of CUPS in Tactician-4's Realm"
2. **Major Arcana plays** (Tome and Action) appear under "Major Arcana" with descriptions like "Play The Moon (18) to Tome"
3. **Buy actions** appear under "Buy" with descriptions like "Buy from display0 (cost 7) paying with 7 of SWORDS"
4. **No actions** appear in an unlabelled "Other" category (unless truly unknown)
5. All action buttons are clickable and the game continues after selecting them

## Commit

`Fix ActionChoose using wrong action type names — match engine types`

## Execution Rules

- This is a single fix, single commit
- Client-only change — do NOT modify any engine files
