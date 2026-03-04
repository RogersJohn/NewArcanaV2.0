import React from 'react';
import Card from './Card.jsx';

export default function OpponentSummary({ player }) {
  return (
    <div className="opponent-summary">
      <div className="opponent-header">
        <span className="opponent-name">{player.name}</span>
        <span className="opponent-vp">{player.vp} VP</span>
      </div>
      <div className="opponent-details">
        <span className="opponent-hand-count">{player.hand.length} cards in hand</span>
        {player.hasRoundEndMarker && <span className="round-marker-small">Marker</span>}
      </div>
      <div className="opponent-realm">
        {player.realm.map((card, i) => (
          <Card key={card.id || i} card={card} small />
        ))}
        {player.realm.length === 0 && <span className="empty-zone">No realm</span>}
      </div>
      <div className="opponent-tome">
        {player.tome.map((card, i) => (
          <span key={card.id || i} className="tome-icon" title={card.name}>
            {card.number}
          </span>
        ))}
      </div>
    </div>
  );
}
