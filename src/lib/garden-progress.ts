import type { GardenGrowthStage } from './garden-growth';

export const GARDEN_WATERING_KEY = 'fine:garden:waterings:v1';
export const MEDIUM_WATERINGS = 30;
export const MATURE_WATERINGS = 60;

export type GardenProgress = { count: number; persisted: boolean };
type ProgressStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function growthStageForWaterings(count: number): GardenGrowthStage {
  if (count >= MATURE_WATERINGS) return 'mature';
  return count >= MEDIUM_WATERINGS ? 'medium' : 'growing';
}

function parseCount(raw: string | null): number {
  if (raw === null || !/^\d+$/.test(raw)) return 0;
  const count = Number(raw);
  return Number.isSafeInteger(count) ? count : 0;
}

/** No network or visitor identity: this browser stores only its own cumulative count. */
export function createGardenProgress(storage: ProgressStorage | null) {
  let count = 0;
  let persisted = storage !== null;
  function read(): GardenProgress {
    if (storage && persisted) {
      try { count = parseCount(storage.getItem(GARDEN_WATERING_KEY)); }
      catch { persisted = false; }
    }
    return { count, persisted };
  }
  function water(): GardenProgress {
    // Include sequential updates from other tabs in this browser before adding one.
    read();
    count = Math.min(count + 1, Number.MAX_SAFE_INTEGER);
    if (storage && persisted) {
      try { storage.setItem(GARDEN_WATERING_KEY, String(count)); }
      catch { persisted = false; }
    }
    return { count, persisted };
  }
  return { read, water };
}
