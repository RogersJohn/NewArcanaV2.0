import React, { useState } from 'react';
import Card from '../Card.jsx';

export default function CharityChoice({ decision, onSubmit }) {
  const { state, playerIndex } = decision;
  const [selected, setSelected] = useState(null);
  const player = state.players[playerIndex];
  const hand = player.hand;

  return (
    <div className="action-panel charity-choice">
      <div className="action-title">
        Charity — You scored 0 VP this round
        <div className="action-subtitle" style={{ fontSize: '12px', color: '#8899aa', marginTop: '4px', fontWeight: 'normal' }}>
          Choose one card to keep for next round, or keep nothing.
        </div>
      </div>
      <div className="discard-cards">
        {hand.map((card, i) => (
          <Card
            key={card.id || i}
            card={card}
            selected={selected === i}
            onClick={() => setSelected(prev => prev === i ? null : i)}
          />
        ))}
      </div>
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '8px' }}>
        <button
          className="action-button confirm-button"
          disabled={selected === null}
          onClick={() => onSubmit(selected)}
        >
          Keep Selected Card
        </button>
        <button
          className="action-button"
          onClick={() => onSubmit(-1)}
          style={{ opacity: 0.7 }}
        >
          Keep Nothing
        </button>
      </div>
    </div>
  );
}
