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
