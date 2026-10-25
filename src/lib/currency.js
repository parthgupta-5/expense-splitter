// Currency choice only changes the symbol and number format. There is no conversion.
export const CURRENCIES = [
  { value: 'INR', label: 'Indian Rupee (INR)' },
  { value: 'USD', label: 'US Dollar (USD)' },
  { value: 'EUR', label: 'Euro (EUR)' },
  { value: 'GBP', label: 'British Pound (GBP)' },
  { value: 'AED', label: 'UAE Dirham (AED)' },
  { value: 'SGD', label: 'Singapore Dollar (SGD)' },
];

const formatters = new Map();
const formatterFor = (code) => {
  if (!formatters.has(code)) {
    formatters.set(code, new Intl.NumberFormat('en-IN', { style: 'currency', currency: code, maximumFractionDigits: 2 }));
  }
  return formatters.get(code);
};

export const formatCurrency = (value, code = 'INR') => formatterFor(code).format(Number(value) || 0);

export const currencySymbol = (code = 'INR') => (
  formatterFor(code).formatToParts(0).find((part) => part.type === 'currency')?.value || '₹'
);
