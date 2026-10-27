import React from 'react';
import { Input } from 'antd';
import { parseMoneyInput } from '../lib/money';

/**
 * A text field for money. Phones show the decimal keypad; there are no spinner arrows, and ArrowUp/ArrowDown or the
 * mouse wheel never change the amount. The value stays the text the user typed; parseMoneyInput() turns it into cents.
 */
export default function MoneyInput(props) {
  return <Input inputMode="decimal" autoComplete="off" spellCheck={false} {...props} />;
}

/** Form rules for a required money field: at most two decimal places and more than zero. */
export const moneyRules = (requiredMessage) => [
  { required: true, whitespace: true, message: requiredMessage },
  {
    validator: (_, value) => {
      const error = value && String(value).trim() ? parseMoneyInput(value).error : null;
      return error ? Promise.reject(new Error(error)) : Promise.resolve();
    },
  },
];
