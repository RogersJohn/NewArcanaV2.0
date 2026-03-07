import React, { useState } from 'react';

export default function StartScreen({ onStart }) {
  const [playerCount, setPlayerCount] = useState(4);
  const [aiDifficulty, setAiDifficulty] = useState('medium');
  const [seed, setSeed] = useState('');

  const handleStart = () => {
    onStart({
      playerCount,
      aiDifficulty,
      seed: seed ? Number(seed) : undefined,
    });
  };

  return (
    <div className="start-screen">
      <div className="start-panel">
        <a
          href="../launcher/index.html"
          style={{ fontSize: '13px', color: '#8899aa', textDecoration: 'none', marginBottom: '12px', display: 'inline-block' }}
        >&larr; Back to Menu</a>
        <h1 className="start-title">New Arcana</h1>
        <p className="start-subtitle">A Tarot Card Game</p>

        <div className="start-options">
          <label className="start-label">
            Players
            <select
              value={playerCount}
              onChange={e => setPlayerCount(Number(e.target.value))}
              className="start-select"
            >
              <option value={3}>3 Players</option>
              <option value={4}>4 Players</option>
              <option value={5}>5 Players</option>
            </select>
          </label>

          <label className="start-label">
            AI Difficulty
            <select
              value={aiDifficulty}
              onChange={e => setAiDifficulty(e.target.value)}
              className="start-select"
            >
              <option value="easy">Easy (Random)</option>
              <option value="medium">Medium (Diverse)</option>
              <option value="hard">Hard (Scoring)</option>
            </select>
          </label>

          <label className="start-label">
            Seed (optional)
            <input
              type="number"
              value={seed}
              onChange={e => setSeed(e.target.value)}
              placeholder="Random"
              className="start-input"
            />
          </label>
        </div>

        <button className="start-button" onClick={handleStart}>
          Start Game
        </button>
      </div>
    </div>
  );
}
