import React from 'react';
import Card from '../Card.jsx';

export default function DrawSourceChoice({ decision, onSubmit }) {
  const { state, playerIndex, topDiscardCard, drawNumber, totalDraws } = decision;

  return (
    <div className="action-panel draw-source-choice">
      <div className="action-title">
        Draw Phase — Choose source (draw {drawNumber} of {totalDraws})
        <div className="action-subtitle" style={{ fontSize: '12px', color: '#8899aa', marginTop: '4px', fontWeight: 'normal' }}>
          Draw from the deck (unknown) or take the top of the discard pile.
        </div>
      </div>
      {topDiscardCard && (
        <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0' }}>
          <Card card={topDiscardCard} />
        </div>
      )}
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '8px' }}>
        <button
          className="action-button"
          onClick={() => onSubmit('deck')}
        >
          Draw from Deck
        </button>
        <button
          className="action-button"
          onClick={() => onSubmit('discard')}
        >
          Take {topDiscardCard ? topDiscardCard.name || `${topDiscardCard.rank} of ${topDiscardCard.suit}` : 'Discard'}
        </button>
      </div>
    </div>
  );
}
