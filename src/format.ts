const LOCALE = 'en-IN';

/** Minor units (e.g. paise) to a display string, using the currency's own number of decimals. */
export function formatMoney(amountMinor: number, currency: string): string {
  const format = new Intl.NumberFormat(LOCALE, { style: 'currency', currency });
  const digits = format.resolvedOptions().maximumFractionDigits ?? 2;
  return format.format(amountMinor / 10 ** digits);
}

const dateTime = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeStyle: 'short' });

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : dateTime.format(date);
}

/** SCREAMING_CASE enum value to "Screaming case". */
export function humanise(value: string): string {
  const words = value.toLowerCase().replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
