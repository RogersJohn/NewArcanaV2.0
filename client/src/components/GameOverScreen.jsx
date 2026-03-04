import React from 'react';

export default function GameOverScreen({ gameState, onPlayAgain }) {
  if (!gameState) return null;

  const players = [...gameState.players]
    .map((p, i) => ({ ...p, index: i }))
    .sort((a, b) => b.vp - a.vp);

  const winner = players[0];

  return (
    <div className="gameover-screen">
      <div className="gameover-panel">
        <h1 className="gameover-title">Game Over</h1>
        <p className="gameover-reason">{gameState.gameEndReason}</p>

        <div className="gameover-winner">
          {winner.index === 0 ? 'You Win!' : `${winner.name} Wins!`}
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
            {players.map((p, rank) => (
              <tr key={p.index} className={p.index === 0 ? 'gameover-human' : ''}>
                <td>{rank + 1}</td>
                <td>{p.index === 0 ? `${p.name} (You)` : p.name}</td>
                <td>{p.vp}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <button className="start-button" onClick={onPlayAgain}>
          Play Again
        </button>
      </div>
    </div>
  );
}
