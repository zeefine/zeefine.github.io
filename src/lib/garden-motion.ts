export interface GardenMotion {
  readonly rotation: number;
  readonly turning: boolean;
  setView(index: number, animate: boolean): void;
  advance(deltaSeconds: number): void;
  finishView(): void;
}

const VIEW_ANGLES = [0, Math.PI / 2, Math.PI] as const;
const TURN_DURATION = 0.3;

/** Animate only explicit view changes; the tree remains static between selections. */
export function createGardenMotion(): GardenMotion {
  let rotation = 0;
  let target = 0;
  let origin = 0;
  let turnElapsed = 0;
  let turning = false;

  function finishView() {
    rotation = target;
    origin = target;
    turnElapsed = 0;
    turning = false;
  }

  return {
    get rotation() { return rotation; },
    get turning() { return turning; },

    setView(index, animate) {
      const nextTarget = VIEW_ANGLES[index] ?? VIEW_ANGLES[0];
      if (nextTarget === target) {
        if (!animate) finishView();
        return;
      }
      target = nextTarget;
      if (!animate || rotation === target) {
        finishView();
        return;
      }
      origin = rotation;
      turnElapsed = 0;
      turning = true;
    },

    advance(deltaSeconds) {
      if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
      const delta = Math.min(deltaSeconds, 0.1);
      if (!turning) return;

      turnElapsed += delta;
      // Tolerate floating-point accumulation at precisely 300 ms, then stop writing rotation.
      if (turnElapsed >= TURN_DURATION - 1e-9) {
        finishView();
        return;
      }
      const progress = turnElapsed / TURN_DURATION;
      const eased = progress * progress * (3 - 2 * progress);
      rotation = origin + (target - origin) * eased;
    },

    finishView,
  };
}

/** Wind follows elapsed visible playback time; view transitions keep their own easing. */
export function createGardenWindClock() {
  let seconds = 0;
  let origin = 0;
  let startedAt: number | null = null;
  let lastFrame: number | null = null;
  function suspend() { startedAt = null; lastFrame = null; }

  return {
    get seconds() { return seconds; },
    tick(now: number) {
      if (!Number.isFinite(now) || (lastFrame !== null && now < lastFrame)) return seconds;
      if (startedAt === null) { startedAt = now; origin = seconds; }
      lastFrame = now;
      seconds = (origin + (now - startedAt) / 1000) % 8;
      return seconds;
    },
    suspend,
    seek(next: number) {
      if (!Number.isFinite(next)) return;
      // Preserve 8 as the scrubber endpoint; shaders render it identically to 0.
      seconds = Math.max(0, Math.min(8, next));
      suspend();
    },
  };
}
