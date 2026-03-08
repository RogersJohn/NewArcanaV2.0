import React, { useState, useRef, useCallback } from 'react';

export default function Tooltip({ text }) {
  if (!text) return null;
  const iconRef = useRef(null);
  const [style, setStyle] = useState({});
  const [visible, setVisible] = useState(false);

  const show = useCallback(() => {
    if (!iconRef.current) return;
    const rect = iconRef.current.getBoundingClientRect();
    let left = rect.left;
    let top = rect.top - 6;
    const maxLeft = window.innerWidth - 320;
    if (left > maxLeft) left = maxLeft;
    if (left < 8) left = 8;
    setStyle({ left: `${left}px`, top: `${top}px`, transform: 'translateY(-100%)' });
    setVisible(true);
  }, []);

  const hide = useCallback(() => setVisible(false), []);

  return (
    <span
      className="tooltip-wrap"
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      <span className="tooltip-icon" ref={iconRef}>?</span>
      {visible && (
        <span className="tooltip-text" style={{ ...style, visibility: 'visible', opacity: 1 }}>
          {text}
        </span>
      )}
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
