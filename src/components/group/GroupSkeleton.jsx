import React from 'react';
import '../../group.css';

/** Placeholder shaped like the finished page, so loading shows the layout instead of a spinner. */
export default function GroupSkeleton() {
  return (
    <div className="gp gp-skeleton" role="status" aria-label="Loading group">
      <span className="gp-sk gp-sk-title" />
      <span className="gp-sk gp-sk-total" />
      <span className="gp-sk gp-sk-line" />
      {[0, 1, 2].map((row) => <span key={row} className="gp-sk gp-sk-row" />)}
      {[0, 1, 2, 3].map((row) => <span key={'e' + row} className="gp-sk gp-sk-row is-tall" />)}
    </div>
  );
}
