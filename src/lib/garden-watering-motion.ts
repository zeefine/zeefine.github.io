/** One finite shower, independent of the looping breeze and saved watering count. */
export const WATERING_SECONDS = 2.6;
export const WATER_IMPACT_COUNT = 12;
export const WATER_RESPONSE_SECONDS = .9;
/** Local blade response only; independent of all ambient wind strengths. */
export const WATER_LEAF_RESPONSE = { strength: .38, damping: 2.8, frequency: 2.4 } as const;
export type WaterPoint = readonly [number, number, number];
export type WaterDrop = { target: WaterPoint; startY: number; delay: number; duration: number };

/** Pick exposed leaves, then spread the shower across the actual stage's canopy. */
export function wateringTargets(points: readonly WaterPoint[]): WaterPoint[] {
  const cells = new Map<string, WaterPoint>();
  for (const point of points) {
    const key = `${Math.floor(point[0] / .65)},${Math.floor(point[2] / .65)}`;
    const previous = cells.get(key);
    if (!previous || point[1] > previous[1]) cells.set(key, point);
  }
  const candidates = [...cells.values()].sort((a, b) => b[1] - a[1]);
  if (!candidates.length) return [];
  const chosen = [candidates.shift()!];
  while (chosen.length < WATER_IMPACT_COUNT && candidates.length) {
    let best = 0, distance = -1;
    candidates.forEach((point, index) => {
      const nearest = Math.min(...chosen.map(other => (point[0] - other[0]) ** 2 + (point[2] - other[2]) ** 2));
      if (nearest > distance) { distance = nearest; best = index; }
    });
    chosen.push(candidates.splice(best, 1)[0]!);
  }
  return chosen;
}

export function wateringDrops(targets: readonly WaterPoint[]): WaterDrop[] {
  const startY = Math.max(...targets.map(point => point[1])) + .9;
  return targets.flatMap((target, index) => [0, 1].map(pass => ({
    target, startY, delay: index * .035 + pass * .18,
    duration: .65 + Math.sqrt(startY - target[1]) * .15,
  })));
}

/** Accelerating fall, followed by a short contraction at the leaf surface. */
export function sampleWaterDrop(drop: WaterDrop, seconds: number) {
  const age = seconds - drop.delay;
  const fraction = Math.max(0, Math.min(1, age / drop.duration));
  return {
    y: drop.startY + (drop.target[1] - drop.startY) * (.2 * fraction + .8 * fraction * fraction),
    scale: age < 0 ? 0 : Math.max(0, Math.min(1, age / .08, 1 - (age - drop.duration) / .1)),
  };
}

export function createWateringClock() {
  let seconds = -1;
  return {
    get seconds() { return seconds; },
    get active() { return seconds >= 0; },
    start() { seconds = 0; },
    stop() { seconds = -1; },
    advance(delta: number) {
      if (seconds < 0 || !Number.isFinite(delta) || delta <= 0) return;
      seconds += delta;
      if (seconds >= WATERING_SECONDS) seconds = -1;
    },
  };
}
