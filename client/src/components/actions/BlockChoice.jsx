import React from 'react';
import { cardDisplayName } from '../../utils/cardFormatting.js';

export default function BlockChoice({ decision, onSubmit }) {
  const isAce = decision.type === 'ACE_BLOCK';
  const blockType = isAce ? 'Ace' : 'King';

  const attackDesc = decision.action
    ? cardDisplayName(decision.action.card || decision.attackCard)
    : decision.attackCard
    ? cardDisplayName(decision.attackCard)
    : 'incoming attack';

  return (
    <div className="action-panel block-choice block-overlay">
      <div className="action-title block-urgent">
        Block with {blockType}?
      </div>
      <div className="block-description">
        {attackDesc} is attacking your realm!
      </div>
      <div className="block-buttons">
        <button
          className="action-button block-yes"
          onClick={() => onSubmit(true)}
        >
          Block
        </button>
        <button
          className="action-button block-no"
          onClick={() => onSubmit(false)}
        >
          Allow
        </button>
      </div>
    </div>
  );
}
