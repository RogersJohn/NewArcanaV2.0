import React, { useMemo } from 'react';
import { cardDisplayName } from '../../utils/cardFormatting.js';

/**
 * Categorize legal actions for structured display.
 */
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
    else if (t === 'PLAY_SET' || t === 'EXTEND_SET') categories.play.push(action);
    else if (t === 'ATTACK' || t === 'ROYAL_ATTACK') categories.attack.push(action);
    else if (t === 'PLAY_MAJOR' || t === 'PLAY_MAJOR_TO_TOME') categories.major.push(action);
    else if (t === 'PLAY_WILD') categories.wild.push(action);
    else if (t === 'BUY_MAJOR') categories.buy.push(action);
    else categories.other.push(action);
  }

  return categories;
}

function describeAction(action) {
  switch (action.type) {
    case 'PASS':
      return 'Pass';
    case 'PLAY_SET':
      return `Play set: ${action.cards.map(c => cardDisplayName(c)).join(', ')}`;
    case 'EXTEND_SET':
      return `Extend set: ${action.cards.map(c => cardDisplayName(c)).join(', ')}`;
    case 'ATTACK':
    case 'ROYAL_ATTACK':
      return `Attack P${action.targetPlayer + 1} with ${cardDisplayName(action.card)} → ${cardDisplayName(action.targetCard)}`;
    case 'PLAY_MAJOR':
      return `Play ${action.card.name} (effect)`;
    case 'PLAY_MAJOR_TO_TOME':
      return `Play ${action.card.name} to Tome`;
    case 'PLAY_WILD':
      return `Play ${action.card.name} as Wild to Realm`;
    case 'BUY_MAJOR':
      return `Buy Major from ${action.source} (cost ${action.cost})`;
    default:
      return `${action.type}`;
  }
}

export default function ActionChoose({ decision, onSubmit }) {
  const { legalActions } = decision;
  const categories = useMemo(() => categorizeActions(legalActions), [legalActions]);

  const handleClick = (action) => {
    // Find the index in the original legalActions array
    const index = legalActions.indexOf(action);
    onSubmit(action);
  };

  const renderCategory = (label, actions, className) => {
    if (actions.length === 0) return null;
    return (
      <div className={`action-category ${className}`}>
        <div className="action-category-label">{label}</div>
        {actions.map((action, i) => (
          <button
            key={i}
            className="action-button"
            onClick={() => handleClick(action)}
          >
            {describeAction(action)}
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="action-panel action-choose">
      <div className="action-title">Choose an Action</div>
      <div className="action-list">
        {renderCategory('Play Cards', categories.play, 'cat-play')}
        {renderCategory('Wild', categories.wild, 'cat-wild')}
        {renderCategory('Attack', categories.attack, 'cat-attack')}
        {renderCategory('Major Arcana', categories.major, 'cat-major')}
        {renderCategory('Buy', categories.buy, 'cat-buy')}
        {renderCategory('Other', categories.other, 'cat-other')}
        {renderCategory('', categories.pass, 'cat-pass')}
      </div>
    </div>
  );
}
