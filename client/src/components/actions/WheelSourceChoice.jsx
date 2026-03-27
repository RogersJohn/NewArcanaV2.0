import React, { useState } from 'react';

export default function WheelSourceChoice({ decision, onSubmit }) {
  const [selections, setSelections] = useState([]);

  const state = decision.state || {};

  // Build available sources from game state
  const availableSources = [];

  if ((state.majorDeck?.length > 0) || (state.majorDeckCount > 0)) {
    availableSources.push({ source: 'draw', label: 'Major Draw Pile' });
  }
  for (let i = 0; i < 3; i++) {
    if (state.display?.[i]) {
      const card = state.display[i];
      const name = card.name || `Card ${card.number}`;
      availableSources.push({
        source: 'display',
        slotIndex: i,
        label: `Display: ${name} (slot ${i})`,
      });
    }
  }
  if ((state.majorDiscard?.length > 0) || (state.majorDiscardCount > 0)) {
    availableSources.push({ source: 'discard', label: 'Major Discard Pile' });
  }

  const addSelection = (src) => {
    if (selections.length >= 2) return;
    setSelections(prev => [...prev, src]);
  };

  const removeSelection = (index) => {
    setSelections(prev => prev.filter((_, i) => i !== index));
  };

  const handleConfirm = () => {
    const result = selections.map(s => {
      const obj = { source: s.source };
      if (s.slotIndex != null) obj.slotIndex = s.slotIndex;
      return obj;
    });
    onSubmit(result);
  };

  return (
    <div className="action-panel wheel-source-choice">
      <div className="action-title">Wheel of Fortune — Choose 2 Sources</div>
      <div className="wheel-selections">
        {selections.map((s, i) => (
          <div key={i} className="wheel-selection-tag">
            {s.label}
            <button className="wheel-remove-btn" onClick={() => removeSelection(i)}>×</button>
          </div>
        ))}
        {selections.length < 2 && (
          <div className="wheel-selection-placeholder">
            Pick source {selections.length + 1} of 2
          </div>
        )}
      </div>
      <div className="wheel-sources">
        {availableSources.map((src, i) => (
          <button
            key={`${src.source}-${src.slotIndex ?? i}`}
            className="action-button"
            disabled={selections.length >= 2}
            onClick={() => addSelection(src)}
          >
            {src.label}
          </button>
        ))}
      </div>
      <button
        className="action-button confirm-button"
        disabled={selections.length !== 2}
        onClick={handleConfirm}
      >
        Confirm ({selections.length}/2)
      </button>
    </div>
  );
}
