import React, { useEffect } from 'react';

export default function RoundTransition({ transition, onDismiss }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 2000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className="round-transition-overlay" onClick={onDismiss}>
      <div className="round-transition-content">
        <h2>Round {transition.fromRound} Complete</h2>
        <p>Starting Round {transition.toRound}</p>
      </div>
    </div>
  );
}
