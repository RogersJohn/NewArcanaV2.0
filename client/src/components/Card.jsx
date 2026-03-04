import React from 'react';
import { SUIT_SYMBOLS, SUIT_COLORS, CATEGORY_COLORS, formatRank } from '../utils/cardFormatting.js';

export default function Card({ card, selected, onClick, small, facedown }) {
  if (!card || facedown) {
    return (
      <div
        className={`card card-facedown ${small ? 'card-small' : ''}`}
        onClick={onClick}
      >
        <div className="card-back">?</div>
      </div>
    );
  }

  const isMinor = card.type === 'minor';
  const isMajor = card.type === 'major';

  const suitColor = isMinor ? SUIT_COLORS[card.suit] : null;
  const categoryColor = isMajor ? (CATEGORY_COLORS[card.category] || '#6c3483') : null;

  const style = {};
  if (isMinor) {
    style.borderColor = suitColor;
    style.color = suitColor;
  } else if (isMajor) {
    style.borderColor = categoryColor;
  }

  return (
    <div
      className={`card ${isMinor ? 'card-minor' : 'card-major'} ${selected ? 'card-selected' : ''} ${small ? 'card-small' : ''} ${onClick ? 'card-clickable' : ''}`}
      style={style}
      onClick={onClick}
    >
      {isMinor ? (
        <>
          <div className="card-rank">{formatRank(card.rank)}</div>
          <div className="card-suit" style={{ color: suitColor }}>
            {SUIT_SYMBOLS[card.suit]}
          </div>
        </>
      ) : (
        <>
          <div className="card-number">{card.number}</div>
          <div className="card-name">{card.name}</div>
          <div className="card-category" style={{ color: categoryColor }}>
            {card.category}
          </div>
        </>
      )}
    </div>
  );
}
