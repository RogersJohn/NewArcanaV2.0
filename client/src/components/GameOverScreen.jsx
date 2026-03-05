import React, { useState, useRef } from 'react';

export default function GameOverScreen({ gameState, onPlayAgain }) {
  if (!gameState) return null;
  const [showLog, setShowLog] = useState(false);
  const logRef = useRef(null);

  const players = [...gameState.players]
    .map((p, i) => ({ ...p, index: i }))
    .sort((a, b) => b.vp - a.vp);

  const topVp = players[0].vp;
  const winners = players.filter(p => p.vp === topVp);
  const isHumanWinner = winners.some(p => p.index === 0);
  const isTie = winners.length > 1;

  const reasonLabels = {
    death_purchased: 'Death was purchased',
    death_revealed: 'Death revealed in display',
    celestial_win: 'Celestial victory',
    max_rounds: 'Maximum rounds reached',
    deck_exhaustion: 'Not enough cards to deal',
  };

  const endReasonText = reasonLabels[gameState.gameEndReason] || gameState.gameEndReason;

  const winnerText = isTie
    ? (isHumanWinner ? 'Tied!' : `${winners.map(w => w.name).join(' & ')} Tied!`)
    : (isHumanWinner ? 'You Win!' : `${winners[0].name} Wins!`);

  const copyLog = () => {
    const logText = (gameState.log || []).join('\n');
    navigator.clipboard.writeText(logText).then(() => {
      alert('Game log copied to clipboard');
    }).catch(() => {
      if (logRef.current) {
        logRef.current.select();
        document.execCommand('copy');
      }
    });
  };

  return (
    <div className="gameover-screen">
      <div className="gameover-panel">
        <h1 className="gameover-title">Game Over</h1>
        <p className="gameover-reason">{endReasonText}</p>
        <p className="gameover-meta" style={{ fontSize: '12px', color: '#8899aa', margin: '4px 0 12px' }}>
          Round {gameState.roundNumber} | Pot: {gameState.pot}vp
        </p>

        <div className="gameover-winner" style={{ color: isHumanWinner ? '#2ecc71' : '#e67e22' }}>
          {winnerText}
        </div>

        <table className="gameover-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Player</th>
              <th>VP</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p, rank) => {
              const isTiedWinner = p.vp === topVp && isTie;
              return (
                <tr key={p.index} className={p.index === 0 ? 'gameover-human' : ''}>
                  <td>{isTiedWinner ? '=' : rank + 1}</td>
                  <td>{p.index === 0 ? `${p.name} (You)` : p.name}</td>
                  <td>{p.vp}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '16px' }}>
          <button className="start-button" onClick={onPlayAgain}>
            Play Again
          </button>
          <button
            className="start-button"
            style={{ background: '#2c3e50' }}
            onClick={() => setShowLog(!showLog)}
          >
            {showLog ? 'Hide Log' : 'Show Game Log'}
          </button>
        </div>

        {showLog && (
          <div style={{ marginTop: '16px', textAlign: 'left' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '14px', fontWeight: 600, color: '#ccc' }}>
                Full Game Log ({(gameState.log || []).length} entries)
              </span>
              <button
                onClick={copyLog}
                style={{
                  padding: '4px 12px',
                  fontSize: '11px',
                  background: '#34495e',
                  color: '#ecf0f1',
                  border: '1px solid #5a6a7a',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Copy Log
              </button>
            </div>
            <div
              style={{
                maxHeight: '400px',
                overflow: 'auto',
                background: '#0a0a1a',
                border: '1px solid #2a3a4a',
                borderRadius: '6px',
                padding: '8px',
                fontSize: '11px',
                fontFamily: 'monospace',
                lineHeight: '1.5',
                color: '#aabbcc',
              }}
            >
              {(gameState.log || []).map((entry, i) => {
                let color = '#aabbcc';
                if (entry.startsWith('[DEBUG]') || entry.startsWith('[AI]')) color = '#7f8c8d';
                else if (entry.startsWith('[FINAL]')) color = '#f39c12';
                else if (entry.startsWith('===')) color = '#3498db';
                else if (entry.startsWith('---')) color = '#2ecc71';
                else if (/block/i.test(entry)) color = '#e74c3c';
                else if (/vp|wins? pot|bonus/i.test(entry)) color = '#f1c40f';
                else if (/Game ended|GAME ENDED/i.test(entry)) color = '#e74c3c';
                return (
                  <div key={i} style={{ color }}>
                    {entry}
                  </div>
                );
              })}
            </div>
            <textarea
              ref={logRef}
              value={(gameState.log || []).join('\n')}
              readOnly
              style={{ position: 'absolute', left: '-9999px' }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
