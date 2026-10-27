// Each group has one currency. It changes the symbol and number format only; there is no conversion.
import { centsToDecimal } from './money';

export const DEFAULT_CURRENCY = 'INR';
export const CURRENCIES = [
  { value: 'INR', label: 'Indian Rupee (INR)' },
  { value: 'USD', label: 'US Dollar (USD)' },
  { value: 'EUR', label: 'Euro (EUR)' },
  { value: 'GBP', label: 'British Pound (GBP)' },
  { value: 'AED', label: 'UAE Dirham (AED)' },
  { value: 'SGD', label: 'Singapore Dollar (SGD)' },
];

export const isCurrency = (code) => CURRENCIES.some((item) => item.value === code);

const formatters = new Map();
const formatterFor = (code) => {
  if (!formatters.has(code)) {
    formatters.set(code, new Intl.NumberFormat('en-IN', { style: 'currency', currency: code, maximumFractionDigits: 2 }));
  }
  return formatters.get(code);
};

/** Formats integer cents as currency. The formatter is given an exact decimal string, never a float. */
export const formatCents = (cents, code = DEFAULT_CURRENCY) => (
  formatterFor(isCurrency(code) ? code : DEFAULT_CURRENCY).format(centsToDecimal(Number.isSafeInteger(cents) ? cents : 0))
);

export const currencySymbol = (code = DEFAULT_CURRENCY) => (
  formatterFor(isCurrency(code) ? code : DEFAULT_CURRENCY).formatToParts(0).find((part) => part.type === 'currency')?.value || '₹'
);
