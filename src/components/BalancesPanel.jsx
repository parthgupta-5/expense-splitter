import React, { useState } from 'react';
import PersonMark from './group/PersonMark';
import { SETTLE_EPSILON } from '../lib/splits';

function describe(balance) {
  if (balance > SETTLE_EPSILON) return { dir: 'owed', label: 'is owed', sign: '+' };
  if (balance < -SETTLE_EPSILON) return { dir: 'owes', label: 'owes', sign: '−' };
  return { dir: 'square', label: 'settled', sign: '' };
}

/**
 * Who is owed and who owes, one hairline row per person. Direction is written (label and sign), drawn
 * (bar side and hatching) and coloured, so no single channel carries it alone.
 */
export default function BalancesPanel({ balances, formatMoney }) {
  const [openName, setOpenName] = useState(null);
  const entries = Object.entries(balances);
  const largest = Math.max(SETTLE_EPSILON, ...entries.map(([, values]) => Math.abs(values.balance)));
  return (
    <ul className="gp-plain-list gp-balances" aria-label="Balances">
      {entries.map(([name, values]) => {
        const state = describe(values.balance);
        const open = openName === name;
        const width = Math.round((Math.abs(values.balance) / largest) * 100);
        return (
          <li key={name} className="gp-balance" data-dir={state.dir}>
            <button
              type="button"
              className="gp-balance-main"
              aria-expanded={open}
              onClick={() => setOpenName(open ? null : name)}
            >
              <PersonMark name={name} size={32} />
              <span className="gp-balance-name">{name}</span>
              <span className="gp-balance-figure">
                <span className="gp-balance-label">{state.label}</span>
                {state.dir !== 'square' && (
                  <span className="gp-amount">{state.sign}{formatMoney(Math.abs(values.balance))}</span>
                )}
              </span>
            </button>
            <span className="gp-track" aria-hidden="true">
              <span className="gp-track-fill" style={{ width: width / 2 + '%' }} />
            </span>
            {open && (
              <p className="gp-balance-detail">
                Paid {formatMoney(values.paid)} · Share {formatMoney(values.share)}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
