import React from 'react';
import ActionChoose from './actions/ActionChoose.jsx';
import MajorKeepChoice from './actions/MajorKeepChoice.jsx';
import DiscardChoice from './actions/DiscardChoice.jsx';
import BlockChoice from './actions/BlockChoice.jsx';
import WheelSourceChoice from './actions/WheelSourceChoice.jsx';
import WheelKeepChoice from './actions/WheelKeepChoice.jsx';
import SuitChoice from './actions/SuitChoice.jsx';

export default function ActionPanel({ decision, gameState, onSubmit }) {
  if (!decision) return null;

  const { type } = decision;

  switch (type) {
    case 'ACTION':
      return <ActionChoose decision={decision} onSubmit={onSubmit} />;
    case 'MAJOR_KEEP':
      return <MajorKeepChoice decision={decision} onSubmit={onSubmit} />;
    case 'DISCARD':
    case 'REALM_DISCARD':
    case 'TOME_DISCARD':
      return <DiscardChoice decision={decision} onSubmit={onSubmit} />;
    case 'ACE_BLOCK':
    case 'KING_BLOCK':
      return <BlockChoice decision={decision} onSubmit={onSubmit} />;
    case 'WHEEL_SOURCES':
      return <WheelSourceChoice decision={decision} onSubmit={onSubmit} />;
    case 'WHEEL_KEEP':
      return <WheelKeepChoice decision={decision} onSubmit={onSubmit} />;
    case 'MAGICIAN_SUIT':
      return <SuitChoice decision={decision} onSubmit={onSubmit} />;
    default:
      return <div className="action-panel">Unknown decision: {type}</div>;
  }
}
