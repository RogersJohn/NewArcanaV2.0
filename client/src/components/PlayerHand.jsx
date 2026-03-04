import React from 'react';
import Card from './Card.jsx';

export default function PlayerHand({ cards, decision, onSubmit }) {
  // Hand cards are not directly selectable from here — ActionPanel handles selection
  return (
    <div className="player-hand">
      <div className="hand-label">Your Hand ({cards.length})</div>
      <div className="hand-cards">
        {cards.map((card, i) => (
          <Card key={card.id || i} card={card} />
        ))}
        {cards.length === 0 && <span className="empty-zone">Empty hand</span>}
      </div>
    </div>
  );
}
