import React from 'react';
import Card from '../Card.jsx';

export default function WheelKeepChoice({ decision, onSubmit }) {
  const { cards } = decision;

  return (
    <div className="action-panel wheel-keep-choice">
      <div className="action-title">Wheel of Fortune — Choose a card to keep</div>
      <div className="wheel-keep-cards">
        {cards.map((card, i) => (
          <div key={card.id || i} className="wheel-keep-option" onClick={() => onSubmit(card)}>
            <Card card={card} />
            <button className="action-button keep-button">Keep</button>
          </div>
        ))}
      </div>
    </div>
  );
}
