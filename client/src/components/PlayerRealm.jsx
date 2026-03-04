import React from 'react';
import Card from './Card.jsx';

export default function PlayerRealm({ cards }) {
  return (
    <div className="player-realm">
      <div className="zone-label">Realm ({cards.length})</div>
      <div className="realm-cards">
        {cards.map((card, i) => (
          <Card key={card.id || i} card={card} />
        ))}
        {cards.length === 0 && <span className="empty-zone">Empty realm</span>}
      </div>
    </div>
  );
}
