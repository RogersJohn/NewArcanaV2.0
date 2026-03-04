import React from 'react';
import Card from './Card.jsx';

export default function PlayerTome({ cards }) {
  return (
    <div className="player-tome">
      <div className="zone-label">Tome ({cards.length}/3)</div>
      <div className="tome-cards">
        {cards.map((card, i) => (
          <Card key={card.id || i} card={card} />
        ))}
        {cards.length === 0 && <span className="empty-zone">Empty tome</span>}
      </div>
    </div>
  );
}
