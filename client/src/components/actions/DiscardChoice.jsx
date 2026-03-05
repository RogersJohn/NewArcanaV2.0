import React, { useState, useMemo } from 'react';
import Card from '../Card.jsx';

export default function DiscardChoice({ decision, onSubmit }) {
  const { type, state, playerIndex, numToDiscard } = decision;
  const [selected, setSelected] = useState([]);

  const player = state.players[playerIndex];

  const sourceCards = useMemo(() => {
    switch (type) {
      case 'DISCARD': return player.hand;
      case 'REALM_DISCARD': return player.realm;
      case 'TOME_DISCARD': return player.tome;
      default: return [];
    }
  }, [type, player]);

  const numRequired = type === 'TOME_DISCARD' ? 1 : (numToDiscard || 1);

  const zoneName = type === 'DISCARD' ? 'hand'
    : type === 'REALM_DISCARD' ? 'realm'
    : 'tome';

  const toggleCard = (index) => {
    setSelected(prev => {
      if (prev.includes(index)) {
        return prev.filter(i => i !== index);
      }
      if (prev.length >= numRequired) {
        return [...prev.slice(1), index];
      }
      return [...prev, index];
    });
  };

  const handleConfirm = () => {
    if (type === 'TOME_DISCARD') {
      // Engine expects a single numeric index for tome discard
      onSubmit(selected[0]);
    } else {
      // Engine expects an array of numeric indices, sorted descending
      const sortedIndices = [...selected].sort((a, b) => b - a);
      onSubmit(sortedIndices);
    }
  };

  return (
    <div className="action-panel discard-choice">
      <div className="action-title">
        Discard {numRequired} card{numRequired > 1 ? 's' : ''} from {zoneName}
        {type === 'DISCARD' && (
          <div className="action-subtitle" style={{ fontSize: '12px', color: '#8899aa', marginTop: '4px', fontWeight: 'normal' }}>
            Hand ({player.hand.length}) + Realm ({player.realm.length}) = {player.hand.length + player.realm.length} — limit is {state.config?.gameRules?.handSizeLimit ?? 6}{player.tome?.some(c => c.type === 'major' && c.number === 15) ? ' (Devil +1)' : ''}
          </div>
        )}
        {type === 'REALM_DISCARD' && (
          <div className="action-subtitle" style={{ fontSize: '12px', color: '#8899aa', marginTop: '4px', fontWeight: 'normal' }}>
            Realm has {player.realm.length} cards — maximum is 5
          </div>
        )}
      </div>
      <div className="discard-cards">
        {sourceCards.map((card, i) => (
          <Card
            key={card.id || i}
            card={card}
            selected={selected.includes(i)}
            onClick={() => toggleCard(i)}
          />
        ))}
      </div>
      <button
        className="action-button confirm-button"
        disabled={selected.length !== numRequired}
        onClick={handleConfirm}
      >
        Confirm Discard ({selected.length}/{numRequired})
      </button>
    </div>
  );
}
