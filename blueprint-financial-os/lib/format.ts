export function money(n: number, opts: { decimals?: number; sign?: boolean } = {}): string {
  const { decimals = 0, sign = false } = opts;
  const abs = Math.abs(n);
  const s = abs.toLocaleString('en-NZ', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const prefix = n < 0 ? '−$' : sign && n > 0 ? '+$' : '$';
  return `${prefix}${s}`;
}

/** Compact money: $1.03m, $640k */
export function moneyShort(n: number): string {
  const abs = Math.abs(n);
  const neg = n < 0 ? '−' : '';
  if (abs >= 1_000_000) return `${neg}$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2)}m`;
  if (abs >= 10_000) return `${neg}$${Math.round(abs / 1_000)}k`;
  return `${neg}$${Math.round(abs).toLocaleString()}`;
}

/** Capacity display: rounded to the nearest $10,000 — banks quote borrowing
 *  power roughly, and false precision misleads. Engine values stay exact. */
export function moneyTenK(n: number): string {
  return `$${(Math.round(n / 10_000) * 10_000).toLocaleString('en-NZ')}`;
}

/** Compact form of the $10,000-rounded capacity: $800k, $1.03m. */
export function moneyTenKShort(n: number): string {
  return moneyShort(Math.round(n / 10_000) * 10_000);
}

export function pct(n: number, decimals = 2): string {
  return `${(n * 100).toFixed(decimals)}%`;
}

export function years(n: number): string {
  const y = Math.floor(n);
  const m = Math.round((n - y) * 12);
  if (m === 0) return `${y} yr${y === 1 ? '' : 's'}`;
  if (y === 0) return `${m} mo`;
  return `${y} yr ${m} mo`;
}
