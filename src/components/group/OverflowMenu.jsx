import React, { useEffect, useId, useRef, useState } from 'react';
import Icon from './Icons';

/**
 * A menu button. Items are `{ label, onSelect, disabled, group }`; a change of `group` draws a divider.
 * Arrow keys move between items, Escape closes and returns focus to the button.
 */
export default function OverflowMenu({ label = 'More options', items }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef(null);
  const button = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const away = (event) => { if (!root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  useEffect(() => {
    if (open) root.current?.querySelector('[role="menuitem"]:not([aria-disabled="true"])')?.focus();
  }, [open]);

  const close = (refocus = true) => { setOpen(false); if (refocus) button.current?.focus(); };

  const onKeyDown = (event) => {
    if (event.key === 'Escape' && open) { event.stopPropagation(); close(); return; }
    if (!open || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const nodes = [...root.current.querySelectorAll('[role="menuitem"]:not([aria-disabled="true"])')];
    const at = nodes.indexOf(document.activeElement);
    const next = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: nodes.length - 1 }[event.key];
    nodes[(next + nodes.length) % nodes.length]?.focus();
  };

  return (
    <div className="gp-menu" ref={root} onKeyDown={onKeyDown}>
      <button
        type="button"
        ref={button}
        className="gp-icon-button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(!open)}
      >
        <Icon name="more" />
      </button>
      {open && (
        <div className="gp-menu-list" role="menu" id={id} aria-label={label}>
          {items.map((item, index) => (
            <React.Fragment key={item.label}>
              {index > 0 && items[index - 1].group !== item.group && <div className="gp-menu-divider" role="separator" />}
              <button
                type="button"
                role="menuitem"
                className="gp-menu-item"
                aria-disabled={item.disabled || undefined}
                tabIndex={-1}
                onClick={() => {
                  if (item.disabled) return;
                  close(false);
                  item.onSelect();
                }}
              >
                {item.label}
              </button>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
