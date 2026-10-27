import React from 'react';
import Icon from './group/Icons';
import PersonMark from './group/PersonMark';

/** Add names (comma separated) and list the people already in the group, each with a remove button. */
export default function PeoplePanel({
  people, value, onChange, onAdd, onRemove, autoFocus = false, inputLabel = 'Add participant name',
}) {
  return (
    <div className="gp-people">
      <form
        className="gp-add-person"
        onSubmit={(event) => { event.preventDefault(); onAdd(); }}
      >
        <input
          className="gp-input"
          maxLength={400}
          value={value}
          autoFocus={autoFocus}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Add a name, or several separated by commas"
          aria-label={inputLabel}
          autoComplete="off"
        />
        <button type="submit" className="gp-button is-primary">Add people</button>
      </form>
      {people.length > 0 && (
        <ul className="gp-plain-list gp-people-list" aria-label="People in this group">
          {people.map((name) => (
            <li key={name}>
              <PersonMark name={name} size={32} />
              <span className="gp-people-name">{name}</span>
              <button
                type="button"
                className="gp-icon-button is-danger-outline"
                onClick={() => onRemove(name)}
                aria-label={'Remove ' + name}
              >
                <Icon name="close" size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
