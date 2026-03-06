import React from 'react';

export default function Tooltip({ text }) {
  if (!text) return null;
  return (
    <span className="tooltip-wrap">
      <span className="tooltip-icon">?</span>
      <span className="tooltip-text">{text}</span>
    </span>
  );
}

export function Label({ text, tooltip, children }) {
  return (
    <label className="block">
      <span className="text-sm text-gray-400 inline-flex items-center gap-1">
        {text}
        <Tooltip text={tooltip} />
      </span>
      {children}
    </label>
  );
}
