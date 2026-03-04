import React from 'react';
import { SUIT_SYMBOLS, SUIT_COLORS } from '../../utils/cardFormatting.js';

const SUITS = ['WANDS', 'CUPS', 'SWORDS', 'COINS'];

export default function SuitChoice({ decision, onSubmit }) {
  return (
    <div className="action-panel suit-choice">
      <div className="action-title">The Magician — Choose a suit</div>
      <div className="suit-buttons">
        {SUITS.map(suit => (
          <button
            key={suit}
            className="action-button suit-button"
            style={{ color: SUIT_COLORS[suit], borderColor: SUIT_COLORS[suit] }}
            onClick={() => onSubmit(suit)}
          >
            <span className="suit-symbol">{SUIT_SYMBOLS[suit]}</span>
            <span className="suit-name">{suit.charAt(0) + suit.slice(1).toLowerCase()}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
