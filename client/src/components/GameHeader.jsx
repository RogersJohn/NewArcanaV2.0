import React from 'react';

export default function GameHeader({
  roundNumber, pot, minorDeckCount, majorDeckCount, pitCount,
  aiDelay, setAiDelay, fastForward, toggleFastForward,
}) {
  return (
    <div className="game-header">
      <div className="header-stats">
        <span className="header-stat">Round {roundNumber}</span>
        <span className="header-stat pot-display">Pot: {pot} VP</span>
        <span className="header-stat">Minor Deck: {minorDeckCount}</span>
        <span className="header-stat">Major Deck: {majorDeckCount}</span>
        <span className="header-stat">Pit: {pitCount}</span>
      </div>
      <div className="header-controls">
        <label className="speed-control">
          Speed
          <input
            type="range"
            min="0"
            max="1500"
            step="100"
            value={aiDelay}
            onChange={e => setAiDelay(Number(e.target.value))}
          />
          <span>{aiDelay}ms</span>
        </label>
        <button
          className={`ff-button ${fastForward ? 'ff-active' : ''}`}
          onClick={toggleFastForward}
          title="Fast Forward"
        >
          {fastForward ? '\u23F8' : '\u23E9'}
        </button>
      </div>
    </div>
  );
}
