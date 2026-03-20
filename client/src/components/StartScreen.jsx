import React, { useState } from 'react';

const DEFAULT_PRICES = { draw: 6, display0: 9, display1: 8, display2: 7, discard: 10 };

export default function StartScreen({ onStart }) {
  const [playerCount, setPlayerCount] = useState(4);
  const [aiDifficulty, setAiDifficulty] = useState('medium');
  const [seed, setSeed] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [buyPrices, setBuyPrices] = useState({ ...DEFAULT_PRICES });
  const [startingPot, setStartingPot] = useState('');

  const updatePrice = (key, val) => {
    setBuyPrices(prev => ({ ...prev, [key]: Number(val) || 0 }));
  };

  const hasCustomPrices = Object.keys(DEFAULT_PRICES).some(k => buyPrices[k] !== DEFAULT_PRICES[k]);

  const handleStart = () => {
    const scoring = startingPot !== '' ? { potInitialAbsolute: Number(startingPot) } : undefined;
    onStart({
      playerCount,
      aiDifficulty,
      seed: seed ? Number(seed) : undefined,
      buyPrices: hasCustomPrices ? buyPrices : undefined,
      scoring,
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

        <button
          className="advanced-toggle"
          onClick={() => setShowAdvanced(prev => !prev)}
        >
          {showAdvanced ? 'Hide' : 'Show'} Advanced Settings
        </button>

        {showAdvanced && (
          <div className="advanced-settings">
            <div className="advanced-label">Major Arcana Buy Prices</div>
            <div className="price-grid">
              <label className="price-label">
                Draw Pile
                <input type="number" value={buyPrices.draw} onChange={e => updatePrice('draw', e.target.value)} className="start-input price-input" />
              </label>
              <label className="price-label">
                Display 0
                <input type="number" value={buyPrices.display0} onChange={e => updatePrice('display0', e.target.value)} className="start-input price-input" />
              </label>
              <label className="price-label">
                Display 1
                <input type="number" value={buyPrices.display1} onChange={e => updatePrice('display1', e.target.value)} className="start-input price-input" />
              </label>
              <label className="price-label">
                Display 2
                <input type="number" value={buyPrices.display2} onChange={e => updatePrice('display2', e.target.value)} className="start-input price-input" />
              </label>
              <label className="price-label">
                Discard Pile
                <input type="number" value={buyPrices.discard} onChange={e => updatePrice('discard', e.target.value)} className="start-input price-input" />
              </label>
            </div>
            <div className="advanced-label" style={{ marginTop: '12px' }}>Starting Pot</div>
            <label className="price-label">
              Starting Pot (absolute)
              <input
                type="number"
                value={startingPot}
                onChange={e => setStartingPot(e.target.value)}
                placeholder="Default (per-player)"
                className="start-input price-input"
                min="0"
              />
            </label>
          </div>
        )}

        <button className="start-button" onClick={handleStart}>
          Start Game
        </button>
      </div>
    </div>
  );
}
