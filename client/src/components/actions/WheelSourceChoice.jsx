import React, { useState } from 'react';

const SOURCE_OPTIONS = [
  { value: 'draw', label: 'Minor Draw Pile' },
  { value: 'display', label: 'Major Display' },
  { value: 'discard', label: 'Minor Discard' },
];

export default function WheelSourceChoice({ decision, onSubmit }) {
  const [selected, setSelected] = useState([]);

  const toggleSource = (value) => {
    setSelected(prev => {
      if (prev.includes(value)) {
        return prev.filter(v => v !== value);
      }
      if (prev.length >= 2) {
        return [...prev.slice(1), value];
      }
      return [...prev, value];
    });
  };

  return (
    <div className="action-panel wheel-source-choice">
      <div className="action-title">Wheel of Fortune — Choose 2 Sources</div>
      <div className="wheel-sources">
        {SOURCE_OPTIONS.map(opt => (
          <button
            key={opt.value}
            className={`action-button ${selected.includes(opt.value) ? 'selected' : ''}`}
            onClick={() => toggleSource(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <button
        className="action-button confirm-button"
        disabled={selected.length !== 2}
        onClick={() => onSubmit(selected)}
      >
        Confirm ({selected.length}/2)
      </button>
    </div>
  );
}
