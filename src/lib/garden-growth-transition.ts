import * as THREE from 'three';
import type { createLeafSorter } from './garden-leaf-sorting.ts';
import type { GardenGrowthStage } from './garden-growth.ts';

export const SMALL_TO_MEDIUM_SECONDS = 1.8;
export const MEDIUM_TO_MATURE_SECONDS = 2.2;

/** Only adjacent forward stages grow; restoration and other switches remain immediate. */
export function growthTransitionSeconds(from: GardenGrowthStage, to: GardenGrowthStage) {
  if (from === 'growing' && to === 'medium') return SMALL_TO_MEDIUM_SECONDS;
  if (from === 'medium' && to === 'mature') return MEDIUM_TO_MATURE_SECONDS;
  return 0;
}

type Range = { vertexStart: number; vertexCount: number; indexStart: number; indexCount: number };
type GrowthBranch = {
  parent: number; origin: THREE.Vector3; visible: boolean; depth: number; range?: Range;
};
export type GrowthModel = {
  wood: THREE.Mesh<THREE.BufferGeometry>;
  leaves: THREE.InstancedMesh;
  sorter: ReturnType<typeof createLeafSorter>;
  branches: GrowthBranch[];
  attachments: Array<{ id: number; branch: number }>;
  leafMatrices: Float32Array;
  leafColors: Float32Array;
  leafMotion: Record<string, ArrayLike<number>>;
};

function ease(seconds: number, start: number, end: number) {
  const t = THREE.MathUtils.clamp((seconds - start) / (end - start), 0, 1);
  // Zero velocity at both ends; no overshoot or spring.
  return t * t * (3 - 2 * t);
}

/** A finite clock; the scene suspends calls while hidden, so no catch-up jump. */
export function createGrowthClock(delay = 0, duration = SMALL_TO_MEDIUM_SECONDS) {
  let elapsed = 0;
  return {
    get seconds() { return elapsed >= delay + duration ? duration : Math.max(0, elapsed - delay); },
    get active() { return elapsed < delay + duration; },
    advance(delta: number) {
      if (Number.isFinite(delta) && delta > 0) elapsed = Math.min(delay + duration, elapsed + Math.min(delta, .1));
    },
    finish() { elapsed = delay + duration; },
  };
}

/** One target mesh grows in place. No per-frame mesh construction or extra GPU attributes. */
export function createGrowthTransition(from: GrowthModel, to: GrowthModel, duration = SMALL_TO_MEDIUM_SECONDS) {
  const states = to.branches.map((branch, id) => ({
    branch, old: from.branches[id]!, progress: 0, origin: new THREE.Vector3(),
    // Child origins follow the parent's current shape before their own elongation.
    startOffset: branch.parent < 0 ? new THREE.Vector3() : from.branches[branch.parent]!.visible
      ? from.branches[id]!.origin.clone().sub(from.branches[branch.parent]!.origin) : new THREE.Vector3(),
    endOffset: branch.parent < 0 ? new THREE.Vector3() : branch.origin.clone().sub(to.branches[branch.parent]!.origin),
  }));
  const visible = states.filter(state => state.branch.visible);
  const woodAttributes = Object.entries(to.wood.geometry.attributes).map(([name, attribute]) => {
    const end = Float32Array.from(attribute.array);
    const start = end.slice();
    const oldAttribute = from.wood.geometry.getAttribute(name);
    for (const { branch, old } of visible) {
      const range = branch.range!, width = attribute.itemSize;
      const sides = branch.depth <= 1 ? 10 : 6;
      const rings = range.vertexCount / sides - 1;
      const oldRange = old.range;
      for (let ring = 0; ring <= rings; ring++) {
        const oldRing = oldRange ? ring / rings * (oldRange.vertexCount / sides - 1) : 0;
        const lower = Math.floor(oldRing), upper = Math.ceil(oldRing);
        for (let side = 0; side < sides; side++) {
          const vertex = range.vertexStart + ring * sides + side;
          for (let axis = 0; axis < width; axis++) {
            const slot = vertex * width + axis;
            if (oldRange) {
              const a = (oldRange.vertexStart + lower * sides + side) * width + axis;
              const b = (oldRange.vertexStart + upper * sides + side) * width + axis;
              start[slot] = THREE.MathUtils.lerp(oldAttribute.array[a]!, oldAttribute.array[b]!, oldRing - lower);
            }
            if (name === 'position') {
              end[slot]! -= branch.origin.getComponent(axis);
              start[slot] = oldRange ? start[slot]! - old.origin.getComponent(axis) : 0;
            } else if (!oldRange && (name === 'twigBend' || name === 'branchBend') && axis < 3) {
              start[slot] = 0;
            }
          }
        }
      }
    }
    return { name, attribute, start, end, final: Float32Array.from(attribute.array) };
  });
  const oldLeaves = new Map(from.attachments.map((leaf, index) => [leaf.id, index]));
  const leafStarts = to.attachments.map(leaf => oldLeaves.get(leaf.id));
  const leafAttributes = Object.entries(to.leafMotion).map(([name, values]) => ({
    name, attribute: to.leaves.geometry.getAttribute(name), end: Float32Array.from(values),
    start: from.leafMotion[name]!,
  }));
  const matrix = to.leaves.instanceMatrix;
  const colors = to.leaves.instanceColor!;
  let finished = false;

  function restoreFinal() {
    for (const { attribute, final } of woodAttributes) { attribute.array.set(final); attribute.needsUpdate = true; }
    matrix.array.set(to.leafMatrices);
    colors.array.set(to.leafColors);
    for (const { attribute, end } of leafAttributes) { attribute.array.set(end); attribute.needsUpdate = true; }
    matrix.needsUpdate = colors.needsUpdate = true;
    to.sorter.refresh();
    finished = true;
  }

  return {
    update(seconds: number) {
      if (finished) return;
      if (seconds >= duration) { restoreFinal(); return; }
      // Retain the approved choreography, stretching only its overall duration.
      const time = Number.isFinite(seconds) ? Math.max(0, seconds) * (SMALL_TO_MEDIUM_SECONDS / duration) : 0;
      for (const state of visible) {
        const depth = state.branch.depth;
        const stagger = state.branch.parent < 0 ? 0 : (state.branch.parent % 7) * .015;
        state.progress = depth === 0 ? ease(time, 0, .65)
          : ease(time, .12 + (depth - 1) * .1 + stagger, 1.24 + depth * .065 + stagger);
        if (state.branch.parent < 0) state.origin.set(0, 0, 0);
        else {
          const parent = states[state.branch.parent]!;
          state.origin.copy(state.startOffset).lerp(state.endOffset, parent.progress).add(parent.origin);
        }
      }
      for (const { name, attribute, start, end } of woodAttributes) {
        const width = attribute.itemSize;
        for (const state of visible) {
          const range = state.branch.range!;
          const first = range.vertexStart * width, last = first + range.vertexCount * width;
          for (let slot = first; slot < last; slot++) {
            attribute.array[slot] = THREE.MathUtils.lerp(start[slot]!, end[slot]!, state.progress)
              + (name === 'position' ? state.origin.getComponent(slot % width) : 0);
          }
        }
        attribute.needsUpdate = true;
      }
      for (let index = 0; index < to.attachments.length; index++) {
        const leaf = to.attachments[index]!, oldIndex = leafStarts[index];
        const state = states[leaf.branch]!;
        const p = state.progress;
        const unfold = oldIndex === undefined ? Math.max(.00001, ease(time, .72 + (leaf.branch % 11) * .025, SMALL_TO_MEDIUM_SECONDS)) : 1;
        for (let axis = 0; axis < 16; axis++) {
          const slot = index * 16 + axis;
          const end = to.leafMatrices[slot]!;
          const start = oldIndex === undefined ? end : from.leafMatrices[oldIndex * 16 + axis]!;
          if (axis >= 12 && axis <= 14) {
            const component = axis - 12;
            const a = oldIndex === undefined ? 0 : start - state.old.origin.getComponent(component);
            const b = end - state.branch.origin.getComponent(component);
            matrix.array[slot] = state.origin.getComponent(component) + THREE.MathUtils.lerp(a, b, p);
          } else {
            matrix.array[slot] = axis === 15 ? 1 : THREE.MathUtils.lerp(start, end, p) * unfold;
          }
        }
        for (let axis = 0; axis < 3; axis++) {
          const end = to.leafColors[index * 3 + axis]!;
          colors.array[index * 3 + axis] = oldIndex === undefined ? end : THREE.MathUtils.lerp(from.leafColors[oldIndex * 3 + axis]!, end, p);
        }
        for (const { name, attribute, start, end } of leafAttributes) {
          const width = attribute.itemSize;
          for (let axis = 0; axis < width; axis++) {
            const slot = index * width + axis;
            let value = oldIndex === undefined ? end[slot]! : THREE.MathUtils.lerp(start[oldIndex * width + axis]!, end[slot]!, p);
            // Unfolding changes leaf-local units; keep its inherited wind displacement in world units.
            if (oldIndex === undefined && axis < 3) {
              if (name === 'twigBend' || name === 'branchBend') value *= p / unfold;
              if (name === 'twigShape' || name === 'branchShape') value *= unfold;
            }
            attribute.array[slot] = value;
          }
        }
      }
      matrix.needsUpdate = colors.needsUpdate = true;
      for (const { attribute } of leafAttributes) attribute.needsUpdate = true;
      to.sorter.refresh();
    },
    finish: restoreFinal,
  };
}
