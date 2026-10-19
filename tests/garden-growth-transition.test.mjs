import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { growthStageForWaterings } from '../src/lib/garden-progress.ts';
import { createGardenTree } from '../src/lib/garden-tree.ts';
import { createGrowthClock, SMALL_TO_MEDIUM_SECONDS, MEDIUM_TO_MATURE_SECONDS, growthTransitionSeconds } from '../src/lib/garden-growth-transition.ts';
import { OrthographicCamera, Matrix4, Vector3 } from 'three';

const camera = new OrthographicCamera(-5, 5, 4, -4, .1, 100);
camera.position.set(0, 4, 18); camera.lookAt(0, 4, 0);
function arrays(tree) {
  return tree.group.children.flatMap(mesh => [
    ...Object.values(mesh.geometry.attributes).map(attribute => attribute.array.slice()),
    ...(mesh.isInstancedMesh ? [mesh.instanceMatrix.array.slice(), mesh.instanceColor.array.slice()] : []),
  ]);
}

for (const [fromStage, toStage, duration] of [
  ['growing', 'medium', SMALL_TO_MEDIUM_SECONDS],
  ['medium', 'mature', MEDIUM_TO_MATURE_SECONDS],
]) {

test(`${fromStage} → ${toStage}: growth begins with the existing leaves, opens new leaves at their stems, then exactly matches the target`, () => {
  const source = createGardenTree(fromStage), target = createGardenTree(toStage);
  try {
    const final = arrays(target);
    const transition = target.growFrom(source, duration);
    transition.update(0);
    const from = source.growthModel, to = target.growthModel;
    const oldIds = new Map(from.attachments.map((leaf, i) => [leaf.id, i]));
    const newIds = [];
    for (let i = 0; i < to.attachments.length; i++) {
      const old = oldIds.get(to.attachments[i].id);
      if (old === undefined) {
        newIds.push(i);
        const matrix = new Matrix4().fromArray(to.leaves.instanceMatrix.array, i * 16);
        assert.ok(new Vector3().setFromMatrixColumn(matrix, 1).length() < .00001, 'new leaves start closed');
      } else for (let j = 0; j < 16; j++) {
        assert.ok(Math.abs(to.leaves.instanceMatrix.array[i * 16 + j] - from.leafMatrices[old * 16 + j]) < 1e-6, 'existing leaf starts at its exact saved pose');
      }
    }
    for (const seconds of [.2, .6, .9, 1.2, 1.6].map(t => t * duration / 1.8)) {
      transition.update(seconds);
      for (const data of arrays(target)) assert.ok(data.every(Number.isFinite));
      assert.deepEqual(target.group.scale.toArray(), [1, 1, 1]);
      assert.deepEqual(target.group.rotation.toArray(), [0, 0, 0, 'XYZ']);
      // The first trunk ring may thicken, but its centre stays at the ground origin.
      const root = target.group.children[0].geometry.getAttribute('position');
      const centre = new Vector3();
      // Nine unique vertices; the tenth closes the ring. Its tilted rim is not ground-flat.
      for (let i = 0; i < 9; i++) centre.add(new Vector3().fromBufferAttribute(root, i));
      assert.ok(centre.divideScalar(9).length() < 1e-6, 'the root centre stays at the origin as its radius grows');
      target.sortLeaves(camera); // Sorting must not corrupt the next growth frame.
    }
    transition.update(duration);
    assert.deepEqual(arrays(target), final, 'the final buffers include unchanged wind attributes and colors');
    target.sortLeaves(camera);
    const sorted = arrays(target);
    transition.update(3);
    assert.deepEqual(arrays(target), sorted, 'completed growth stops rewriting instance buffers');
  } finally { source.dispose(); target.dispose(); }
});

test(`${fromStage} → ${toStage}: per-frame growth stays continuous with a fixed root`, () => {
  const source = createGardenTree(fromStage), target = createGardenTree(toStage);
  try {
    const transition = target.growFrom(source, duration);
    let previous;
    for (let i = 0; i <= Math.round(duration * 60); i++) {
      transition.update(i / 60);
      const positions = target.growthModel.wood.geometry.getAttribute('position').array;
      if (previous) {
        let largest = 0;
        for (let j = 0; j < positions.length; j++) largest = Math.max(largest, Math.abs(positions[j] - previous[j]));
        assert.ok(largest < .12, `no branch jump at frame ${i}: ${largest}`);
      }
      previous = positions.slice();
    }
    const current = arrays(target);
    transition.finish();
    assert.deepEqual(arrays(target), current);
  } finally { source.dispose(); target.dispose(); }
});

test(`${fromStage} → ${toStage}: clock waits for water contact and finishes once`, () => {
  const clock = createGrowthClock(.8, duration);
  for (let i = 0; i < 7; i++) clock.advance(.1);
  assert.equal(clock.seconds, 0);
  clock.advance(.1); clock.advance(.1);
  assert.ok(clock.seconds > 0 && clock.seconds < .11);
  const previous = clock.seconds;
  for (const delta of [NaN, Infinity, -2]) clock.advance(delta);
  assert.equal(clock.seconds, previous);
  clock.advance(10);
  assert.ok(clock.seconds - previous < .101, 'returning to an old frame cannot fast-forward growth');
  clock.finish();
  assert.equal(clock.active, false);
  assert.equal(clock.seconds, duration);
  const fractional = createGrowthClock(.879356731, duration);
  for (let i = 0; i < 200; i++) fractional.advance(1 / 60);
  assert.equal(fractional.seconds, duration, 'floating-point delays still land exactly at the endpoint');
});

test(`${fromStage} → ${toStage}: new shoots stay attached to their moving parents`, () => {
  const source = createGardenTree(fromStage), target = createGardenTree(toStage);
  try {
    const transition = target.growFrom(source, duration);
    const branches = target.growthModel.branches;
    const positions = target.growthModel.wood.geometry.getAttribute('position');
    function ringCentres(branch, positions) {
      const sides = branch.depth <= 1 ? 9 : 5, range = branch.range;
      const centers = [];
      for (let first = range.vertexStart; first < range.vertexStart + range.vertexCount; first += sides + 1) {
        const center = new Vector3();
        for (let side = 0; side < sides; side++) center.add(new Vector3().fromBufferAttribute(positions, first + side));
        centers.push(center.divideScalar(sides));
      }
      return centers;
    }
    function distanceToCurve(root, points) {
      let closest = Infinity;
      for (let i = 1; i < points.length; i++) {
        const edge = points[i].clone().sub(points[i - 1]);
        const t = edge.lengthSq() === 0 ? 0 : Math.max(0, Math.min(1, root.clone().sub(points[i - 1]).dot(edge) / edge.lengthSq()));
        closest = Math.min(closest, root.distanceTo(points[i - 1].clone().addScaledVector(edge, t)));
      }
      return closest;
    }
    // Existing meshes approximate curves with as few as four segments. Measure that
    // baseline before growth, rather than requiring a tighter junction than either endpoint.
    const baseline = branches.map((branch, id) => {
      if (!branch.visible || branch.depth < 2) return 0;
      return Math.max(...[source, target].map(tree => {
        const model = tree.growthModel, parent = model.branches[branch.parent];
        if (!parent.visible) return 0;
        return distanceToCurve(model.branches[id].origin,
          ringCentres(parent, model.wood.geometry.getAttribute('position')));
      }));
    });
    for (const seconds of [0, .3, .7, 1.1, 1.6, 1.8].map(t => t * duration / 1.8)) {
      transition.update(seconds);
      const rings = branches.map(branch => branch.visible ? ringCentres(branch, positions) : []);
      for (const [id, branch] of branches.entries()) {
        if (!branch.visible || branch.depth < 2) continue;
        const root = rings[id][0], parent = rings[branch.parent];
        const closest = distanceToCurve(root, parent);
        assert.ok(closest < baseline[id] + .01, `shoot ${id} adds a gap at ${seconds}s: ${closest} (baseline ${baseline[id]})`);
      }
    }
  } finally { source.dispose(); target.dispose(); }
});

}

test('the approved small-to-medium intermediate pose stays unchanged', () => {
  const source = createGardenTree('growing'), target = createGardenTree('medium');
  try {
    target.growFrom(source).update(.9);
    const hash = createHash('sha256');
    for (const data of arrays(target)) hash.update(Buffer.from(data.buffer));
    assert.equal(hash.digest('hex'), '6fc06586dc307fc2c3ee6af6e455cbd676ab0f407b324eb6e2fab538702f6f89');
  } finally { source.dispose(); target.dispose(); }
});

test('both watering thresholds select the matching forward duration; other stage switches are instant', () => {
  for (const [count, seconds] of [[25, 1.8], [50, 2.2]]) {
    assert.equal(growthTransitionSeconds(growthStageForWaterings(count - 1), growthStageForWaterings(count)), seconds);
    assert.equal(growthTransitionSeconds(growthStageForWaterings(count), growthStageForWaterings(count + 1)), 0);
  }
  for (const pair of [['mature', 'medium'], ['medium', 'growing'], ['mature', 'growing'], ['growing', 'mature']]) {
    assert.equal(growthTransitionSeconds(...pair), 0);
  }
});

test('medium-to-mature remains active after the shower ends, then lands exactly at 2.2 seconds', () => {
  const clock = createGrowthClock(.85, MEDIUM_TO_MATURE_SECONDS);
  for (let i = 0; i < 156; i++) clock.advance(1 / 60);
  assert.equal(clock.active, true, 'the watering button must wait for growth after its 2.6s shower');
  assert.ok(clock.seconds < 2.2);
  for (let i = 0; i < 30; i++) clock.advance(1 / 60);
  assert.equal(clock.active, false);
  assert.equal(clock.seconds, 2.2);
});
