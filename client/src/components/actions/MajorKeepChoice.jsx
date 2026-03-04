import React from 'react';
import Card from '../Card.jsx';

export default function MajorKeepChoice({ decision, onSubmit }) {
  const { cards } = decision;

  return (
    <div className="action-panel major-keep-choice">
      <div className="action-title">
        Setup Phase — Choose a Major Arcana to keep
      </div>
      <div className="major-keep-cards">
        {cards.map((card, i) => (
          <div key={card.id || i} className="major-keep-option" onClick={() => onSubmit(card)}>
            <Card card={card} />
            <button className="action-button keep-button">Keep</button>
          </div>
        ))}
      </div>
    </div>
  );
}
