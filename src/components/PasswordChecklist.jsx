import React from 'react';
import { CheckOutlined, MinusOutlined } from '@ant-design/icons';
import { checkPassword } from '../lib/password';

/**
 * Live guidance under a new-password field (as its Form.Item `extra`, which antd links to the input with
 * aria-describedby). Each rule says whether it is met in words, not only by its icon.
 */
export default function PasswordChecklist({ value }) {
  return (
    <ul className="password-checklist" aria-label="Password requirements">
      {checkPassword(value).map((rule) => (
        <li key={rule.id} className={rule.met ? 'is-met' : undefined}>
          {rule.met ? <CheckOutlined aria-hidden="true" /> : <MinusOutlined aria-hidden="true" />}
          <span>{rule.label}</span>
          <span className="visually-hidden">{rule.met ? ' (done)' : ' (still needed)'}</span>
        </li>
      ))}
    </ul>
  );
}
