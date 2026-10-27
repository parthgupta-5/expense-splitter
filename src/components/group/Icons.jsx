import React from 'react';

const paths = {
  back: 'M15 5l-7 7 7 7',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  edit: 'M4 20h4L19 9l-4-4L4 16v4zM13 7l4 4',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13M10 11v6M14 11v6',
  chevron: 'M6 9l6 6 6-6',
  offline: 'M3 3l18 18M8.5 8.8A9 9 0 0 0 3 12M16 13a5 5 0 0 0-2-1.2M5.6 16A9 9 0 0 1 9 12.4M12 19h.01',
};

/** Drawn at one stroke weight so every icon on the page reads as the same hand. */
export default function Icon({ name, size = 20 }) {
  return (
    <svg
      className="gp-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name]} />
    </svg>
  );
}
