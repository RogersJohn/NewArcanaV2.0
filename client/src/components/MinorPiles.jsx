import React from 'react';

export default function MinorPiles({ minorDeckCount, minorDiscardCount, minorDiscardTop, pitCount }) {
  return (
    <div className="minor-piles">
      <div className="display-label">Minor Arcana</div>
      <div className="minor-pile-row">
        <div className="minor-pile">
          <div className="minor-pile-label">Draw</div>
          <div className="minor-pile-count">{minorDeckCount}</div>
        </div>
        <div className="minor-pile">
          <div className="minor-pile-label">Discard</div>
          <div className="minor-pile-count">{minorDiscardCount}</div>
          {minorDiscardTop && (
            <div className="minor-pile-top">
              {minorDiscardTop.rank} of {minorDiscardTop.suit}
            </div>
          )}
        </div>
        <div className="minor-pile">
          <div className="minor-pile-label">Pit</div>
          <div className="minor-pile-count">{pitCount}</div>
        </div>
      </div>
    </div>
  );
}
