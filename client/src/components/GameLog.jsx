import React, { useEffect, useRef } from 'react';

export default function GameLog({ entries }) {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries.length]);

  const getEntryClass = (entry) => {
    if (/attacks?|destroys?|stolen/i.test(entry)) return 'log-attack';
    if (/buys?|purchase/i.test(entry)) return 'log-buy';
    if (/vp|wins? pot|bonus|score/i.test(entry)) return 'log-vp';
    if (/block/i.test(entry)) return 'log-block';
    if (/round|setup/i.test(entry)) return 'log-round';
    return '';
  };

  return (
    <div className="game-log">
      <div className="log-header">Game Log</div>
      <div className="log-entries">
        {entries.map((entry, i) => (
          <div key={i} className={`log-entry ${getEntryClass(entry)}`}>
            {entry}
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}
