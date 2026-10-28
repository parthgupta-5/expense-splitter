import React from 'react';

/**
 * One part of the Settings page (Account, Preferences, Data, Delete account): a heading and divider-separated rows.
 * The heading can take focus, so the section menu can move keyboard and screen-reader users straight to it.
 */
export function SettingsSection({
  id, title, className = '', children,
}) {
  return (
    <section id={id} className={('settings-section ' + className).trim()} aria-labelledby={id + '-heading'}>
      <h2 id={id + '-heading'} className="settings-section-title" tabIndex={-1}>{title}</h2>
      {children}
    </section>
  );
}

/**
 * One aligned row: what it is (with an optional help line) on the left, its controls on the right. On phones the
 * controls move under the text. `labelFor` makes the name a real <label> for that input.
 */
export function SettingRow({
  label, help, labelFor, className = '', children,
}) {
  return (
    <div className={('settings-row ' + className).trim()}>
      <div className="settings-row-copy">
        {labelFor
          ? <label htmlFor={labelFor} className="settings-row-label">{label}</label>
          : <span className="settings-row-label">{label}</span>}
        {help && <span className="settings-row-help">{help}</span>}
      </div>
      <div className="settings-row-control">{children}</div>
    </div>
  );
}
