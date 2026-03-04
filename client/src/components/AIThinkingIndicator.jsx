import React from 'react';

export default function AIThinkingIndicator({ decision, players }) {
  const playerName = players[decision.playerIndex]?.name || `Player ${decision.playerIndex + 1}`;

  return (
    <div className="ai-thinking">
      <div className="ai-thinking-dots">
        <span className="dot"></span>
        <span className="dot"></span>
        <span className="dot"></span>
      </div>
      <div className="ai-thinking-text">
        {playerName} is thinking...
      </div>
      <div className="ai-thinking-type">
        {decision.type.replace(/_/g, ' ')}
      </div>
    </div>
  );
}
