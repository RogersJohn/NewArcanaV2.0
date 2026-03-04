import React from 'react';
import Card from './Card.jsx';

const DISPLAY_COSTS = [7, 8, 9];

export default function MajorDisplay({ display, majorDeckCount }) {
  return (
    <div className="major-display">
      <div className="display-label">Major Arcana Display</div>
      <div className="display-slots">
        {display.map((card, i) => (
          <div key={i} className="display-slot">
            <div className="display-cost">Cost: {DISPLAY_COSTS[i]}</div>
            {card ? (
              <Card card={card} />
            ) : (
              <div className="card card-empty">Empty</div>
            )}
          </div>
        ))}
      </div>
      <div className="display-deck-info">
        Deck: {majorDeckCount} | Draw cost: 6
      </div>
    </div>
  );
}
