import React, { createContext, useContext } from 'react';

// Eight original geometric symbols, each drawn on a 24-unit grid.
const SYMBOLS = [
  <circle key="ring" cx="12" cy="12" r="5" fill="none" strokeWidth="2.2" />,
  <path key="cross" d="M12 6v12M6 12h12" strokeWidth="2.4" />,
  <path key="diamond" d="M12 5.5l6.5 6.5-6.5 6.5L5.5 12z" fill="none" strokeWidth="2.2" />,
  <path key="triangle" d="M12 6l6.5 11.5h-13z" fill="currentColor" stroke="none" />,
  <path key="bars" d="M7 7v10M12 7v10M17 7v10" strokeWidth="2.4" />,
  <g key="dots" fill="currentColor" stroke="none"><circle cx="8" cy="9" r="1.9" /><circle cx="16" cy="9" r="1.9" /><circle cx="12" cy="16" r="1.9" /></g>,
  <path key="chevrons" d="M6.5 9.5L12 14l5.5-4.5M6.5 14.5L12 19l5.5-4.5" fill="none" strokeWidth="2.2" />,
  <path key="half" d="M6.5 12a5.5 5.5 0 0 1 11 0z" fill="currentColor" stroke="none" />,
];
const TONES = 6;

/** A stable hash, so a person keeps the same mark everywhere and across reloads. */
function hash(name) {
  let value = 5381;
  for (let i = 0; i < name.length; i += 1) value = ((value << 5) + value + name.charCodeAt(i)) >>> 0;
  return value;
}

/** Hands every person in a group a distinct symbol and tone where possible, independent of list order. */
export function assignMarks(people) {
  const taken = new Set();
  const marks = {};
  [...people].sort((a, b) => hash(a) - hash(b) || a.localeCompare(b)).forEach((name) => {
    const seed = hash(name);
    let symbol = seed % SYMBOLS.length;
    let tone = Math.floor(seed / SYMBOLS.length) % TONES;
    for (let step = 0; step < SYMBOLS.length * TONES && taken.has(symbol + ':' + tone); step += 1) {
      symbol = (symbol + 1) % SYMBOLS.length;
      if (step % SYMBOLS.length === SYMBOLS.length - 1) tone = (tone + 1) % TONES;
    }
    taken.add(symbol + ':' + tone);
    marks[name] = { symbol, tone };
  });
  return marks;
}

export const MarksContext = createContext({});

/** Decorative: the name is always written next to it, so colour and shape are never the only signal. */
export default function PersonMark({ name, size = 32 }) {
  const seed = hash(name);
  const assigned = useContext(MarksContext)[name];
  const symbol = assigned ? assigned.symbol : seed % SYMBOLS.length;
  const tone = assigned ? assigned.tone : Math.floor(seed / SYMBOLS.length) % TONES;
  return (
    <span
      className="gp-mark"
      data-tone={tone}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" width={size * 0.72} height={size * 0.72} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        {SYMBOLS[symbol]}
      </svg>
    </span>
  );
}
