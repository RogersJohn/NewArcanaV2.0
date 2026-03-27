import React from 'react';
import Card from './Card.jsx';

export default function MajorDisplay({ display, majorDeckCount, majorDiscardCount, majorDiscardTop, buyPrices }) {
  const prices = buyPrices || { display0: 9, display1: 8, display2: 7, draw: 6, discard: 10 };

  return (
    <div className="major-display">
      <div className="display-label">Major Arcana Display</div>
      <div className="display-slots">
        {display.map((card, i) => (
          <div key={i} className="display-slot">
            <div className="display-cost">Cost: {prices[`display${i}`] ?? (9 - i)}</div>
            {card ? (
              <Card card={card} />
            ) : (
              <div className="card card-empty">Empty</div>
            )}
          </div>
        ))}
      </div>
      <div className="major-piles-row">
        <div className="display-deck-info">
          Deck: {majorDeckCount} | Draw cost: {prices.draw ?? 6}
        </div>
        <div className="display-deck-info">
          Discard: {majorDiscardCount ?? 0}
          {majorDiscardTop && (
            <span> — {majorDiscardTop.name || `Card ${majorDiscardTop.number}`}</span>
          )}
          {(majorDiscardCount ?? 0) > 0 && <span> | Buy cost: {prices.discard ?? 10}</span>}
        </div>
      </div>
    </div>
  );
}
