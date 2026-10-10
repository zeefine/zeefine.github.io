export interface CarbonResult {
  grams: number;
  cleaner: number;
}

type CarbonStorage = Pick<Storage, 'getItem' | 'setItem'>;
const CACHE_DURATION = 24 * 60 * 60 * 1000;

/** Badge response contract: https://unpkg.com/website-carbon-badges@1.1.3/b.min.js */
export function parseCarbonResult(value: unknown): CarbonResult | null {
  if (!value || typeof value !== 'object') return null;
  const { c, p } = value as Record<string, unknown>;
  const numeric = (input: unknown) => typeof input === 'number'
    || (typeof input === 'string' && input.trim() !== '');
  if (!numeric(c) || !numeric(p)) return null;
  const grams = Number(c);
  const cleaner = Number(p);
  return Number.isFinite(grams) && grams >= 0 && Number.isFinite(cleaner) && cleaner >= 0 && cleaner <= 100
    ? { grams, cleaner } : null;
}

export async function loadCarbonResult(
  pageUrl: string,
  storage: CarbonStorage | null,
  request: typeof fetch = fetch,
  now = Date.now(),
): Promise<CarbonResult> {
  const page = new URL(pageUrl);
  page.search = '';
  page.hash = '';
  const key = `fine-carbon-v1:${page.href}`;
  try {
    const cached = JSON.parse(storage?.getItem(key) ?? 'null');
    const result = parseCarbonResult(cached);
    if (result && typeof cached.t === 'number' && now >= cached.t && now - cached.t < CACHE_DURATION) return result;
  } catch { /* Missing, blocked or corrupt storage must not prevent measurement. */ }

  const response = await request(`https://api.websitecarbon.com/b?url=${encodeURIComponent(page.href)}`, {
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`Website Carbon returned ${response.status}`);
  const result = parseCarbonResult(await response.json());
  if (!result) throw new Error('Website Carbon returned an invalid result');
  try {
    storage?.setItem(key, JSON.stringify({ c: result.grams, p: result.cleaner, t: now }));
  } catch { /* A valid result remains usable when browser storage is unavailable. */ }
  return result;
}
