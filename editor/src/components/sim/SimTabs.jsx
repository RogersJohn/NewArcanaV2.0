import React, { useState } from 'react';

const TABS = ['Overview', 'Power Rankings', 'Balance', 'Bonuses', 'Game Stats'];

export default function SimTabs({ children }) {
  const [active, setActive] = useState('Overview');

  return (
    <div>
      <div className="flex gap-1 border-b border-gray-700 mb-4">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setActive(t)}
            className={`px-3 py-1.5 text-sm font-medium rounded-t ${
              active === t
                ? 'bg-gray-700 text-amber-400 border border-gray-700 border-b-gray-900'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      {children(active)}
    </div>
  );
}
