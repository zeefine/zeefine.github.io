import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Vector3, Matrix3, Matrix4, PerspectiveCamera } from 'three';
import { createGardenTree } from '../src/lib/garden-tree.ts';
import { windPhaseAt } from '../src/lib/garden-wind-field.ts';

test('the reference tree has finite, valid geometry and a spreading crown', () => {
  const tree = createGardenTree();
  try {
    const bounds = new Box3().setFromObject(tree.group);
    const size = bounds.getSize(new Vector3());
    assert.ok(size.x > size.y, 'the crown should spread horizontally');
    assert.ok(size.y > 5 && size.y < 9);
    assert.ok(Math.abs(bounds.min.y) < .1, 'the trunk meets the ground');
    tree.group.traverse((object) => {
      if (!object.isMesh) return;
      for (const attribute of Object.values(object.geometry.attributes)) {
        assert.ok(attribute.array.every(Number.isFinite), `${object.name} has a non-finite attribute`);
      }
      const vertices = object.geometry.getAttribute('position').count;
      const windPhase = object.geometry.getAttribute('windPhase');
      assert.equal(windPhase.count, object.isInstancedMesh ? object.count : vertices);
      assert.ok(windPhase.array.every(phase => phase >= 0 && phase < 1));
      assert.ok(object.geometry.index.array.every((index) => index >= 0 && index < vertices));
      if (object.isInstancedMesh) assert.ok(object.instanceMatrix.array.every(Number.isFinite));
    });
  } finally { tree.dispose(); }
});

test('every visitor receives the same branch and leaf structure', () => {
  const first = createGardenTree();
  const second = createGardenTree();
  try {
    for (let index = 0; index < first.group.children.length; index++) {
      const a = first.group.children[index];
      const b = second.group.children[index];
      assert.deepEqual(a.geometry.getAttribute('position').array, b.geometry.getAttribute('position').array);
      if (a.isInstancedMesh) {
        assert.deepEqual(a.instanceMatrix.array, b.instanceMatrix.array);
        assert.deepEqual(a.instanceColor.array, b.instanceColor.array);
      }
    }
  } finally { first.dispose(); second.dispose(); }
});

test('leaf detail metadata stays independent, with stable variations and a matching single-leaf study', () => {
  const tree = createGardenTree();
  let study;
  try {
    const [wood, leaves] = tree.group.children;
    assert.equal(wood.geometry.getAttribute('leafEdgeShape'), undefined);
    assert.equal(wood.geometry.getAttribute('leafBladeShape'), undefined);
    const positions = leaves.geometry.getAttribute('position');
    assert.equal(leaves.geometry.getAttribute('leafEdgeShape'), undefined);
    const variation = leaves.geometry.getAttribute('leafEdgeVariation');
    assert.equal(variation.count, leaves.count);
    assert.ok(new Set(Array.from(variation.array).filter((_, i) => i % 4 === 0)).size > leaves.count * .9);
    // Shape is derived in the shader. Reserve Three's declared UV slot as well.
    assert.equal(leaves.geometry.getAttribute('leafBladeShape'), undefined);
    assert.ok(Object.keys(leaves.geometry.attributes).length + 4 + 1 + 1 <= 16,
      'geometry, instance matrix/color and the declared UV slot must fit 16 attributes');
    const bladeVariation = leaves.geometry.getAttribute('leafBladeVariation');
    assert.equal(bladeVariation.count, leaves.count);
    const phases = Array.from(bladeVariation.array).filter((_, i) => i % 2 === 0);
    assert.ok(new Set(phases).size > leaves.count * .9);
    // Each quarter-cycle has many leaves: no whole crown moving in lockstep.
    for (let quarter = 0; quarter < 4; quarter++) {
      assert.ok(phases.filter(phase => Math.floor(phase * 4) === quarter).length > leaves.count * .2);
    }
    for (let i = 0; i < leaves.count; i++) {
      assert.ok(bladeVariation.getY(i) >= .7 - 1e-7 && bladeVariation.getY(i) <= 1);
    }
    study = tree.createLeafStudy();
    assert.equal(study.mesh.count, 1);
    assert.equal(study.mesh.material, leaves.material);
    assert.equal(study.mesh.customDepthMaterial, leaves.customDepthMaterial);
    assert.deepEqual(study.mesh.geometry.getAttribute('position').array, positions.array);
    assert.deepEqual(study.mesh.geometry.getAttribute('leafEdgeVariation').array, variation.array.slice(0, 4));
    assert.deepEqual(study.mesh.geometry.getAttribute('leafBladeVariation').array, bladeVariation.array.slice(0, 2));
    assert.deepEqual(study.mesh.geometry.getAttribute('windPhase').array, leaves.geometry.getAttribute('windPhase').array.slice(0, 2));
    for (const name of ['branchBend', 'branchShape']) assert.ok(study.mesh.geometry.getAttribute(name).array.every(x => x === 0));
    const matrices = leaves.instanceMatrix.array.slice();
    const branches = wood.geometry.getAttribute('position').array.slice();
    tree.setLeafEdges(true);
    tree.setLeafBlades(true);
    for (const time of [0, 2, 4, 6, 8]) tree.updateMotion(time);
    assert.deepEqual(leaves.instanceMatrix.array, matrices, 'leaf poses never rotate with the wind');
    assert.deepEqual(wood.geometry.getAttribute('position').array, branches, 'wood remains fixed');
    assert.deepEqual(tree.group.rotation.toArray().slice(0, 3), [0, 0, 0]);
  } finally { study?.dispose(); tree.dispose(); }
});

test('twig motion covers lower and upper shoots while keeping the trunk fixed and leaf attachments coherent', () => {
  const tree = createGardenTree();
  try {
    const [wood, leaves] = tree.group.children;
    const positions = wood.geometry.getAttribute('position');
    const bend = wood.geometry.getAttribute('twigBend');
    const shape = wood.geometry.getAttribute('twigShape');
    const windPhase = wood.geometry.getAttribute('windPhase');
    const winds = new Map();
    const envelopePhases = new Map();
    const coverage = { lowerLeft: 0, lowerRight: 0, upper: 0 };
    for (let i = 0; i < positions.count; i++) {
      const offset = new Vector3(bend.getX(i), bend.getY(i), bend.getZ(i));
      if (positions.getY(i) < 1.4 && Math.abs(positions.getX(i)) < .3 && Math.abs(positions.getZ(i)) < .3) {
        assert.equal(offset.lengthSq(), 0, 'root and lower trunk are anchored');
      }
      if (!offset.lengthSq()) continue;
      winds.set(bend.getW(i), offset);
      if (envelopePhases.has(bend.getW(i))) {
        assert.equal(windPhase.getX(i), envelopePhases.get(bend.getW(i)), 'strength stays constant along each twig');
      }
      envelopePhases.set(bend.getW(i), windPhase.getX(i));
      assert.ok(shape.getW(i) >= 0 && shape.getW(i) <= 1);
      // A 0.896%-of-length tip bend has at most a 1.792% slope under the quadratic weight.
      assert.ok(Math.abs(offset.dot(new Vector3(shape.getX(i), shape.getY(i), shape.getZ(i)))) <= .01792 + 1e-7,
        'the bend stays far below a fold or orientation reversal');
      if (positions.getY(i) < 3 && positions.getX(i) < -1) coverage.lowerLeft++;
      if (positions.getY(i) < 3 && positions.getX(i) > 1) coverage.lowerRight++;
      if (positions.getY(i) > 4.5) coverage.upper++;
    }
    assert.ok(Object.values(coverage).every(count => count > 0));
    assert.ok(winds.size > 1000);
    const leafBend = leaves.geometry.getAttribute('twigBend');
    const leafShape = leaves.geometry.getAttribute('twigShape');
    const leafWindPhase = leaves.geometry.getAttribute('windPhase');
    let attached = 0;
    const matrix = new Matrix4();
    for (let i = 0; i < leaves.count; i++) {
      const offset = new Vector3(leafBend.getX(i), leafBend.getY(i), leafBend.getZ(i));
      leaves.getMatrixAt(i, matrix);
      if (!offset.lengthSq()) {
        assert.ok(Math.abs(leafWindPhase.getX(i) - windPhaseAt(new Vector3().setFromMatrixPosition(matrix))) < 1e-7);
        continue;
      }
      attached++;
      assert.equal(leafWindPhase.getX(i), envelopePhases.get(leafBend.getW(i)), 'leaf and twig share the exact strength envelope');
      offset.applyMatrix3(new Matrix3().setFromMatrix4(matrix));
      assert.ok(offset.distanceTo(winds.get(leafBend.getW(i))) < 1e-8);
      assert.ok(leafShape.getW(i) > 0 && leafShape.getW(i) <= 1);
    }
    assert.ok(attached > leaves.count * .7);
  } finally { tree.dispose(); }
});

test('single-twig inspection keeps canonical leaf motion after sorting and releases its own resources', () => {
  const tree = createGardenTree();
  let study;
  try {
    const [wood, leaves] = tree.group.children;
    const names = ['leafEdgeVariation', 'leafBladeVariation', 'twigBend', 'twigShape', 'branchBend', 'branchShape', 'windPhase'];
    const original = names.map(name => leaves.geometry.getAttribute(name).array.slice());
    const matrices = leaves.instanceMatrix.array.slice();
    const camera = new PerspectiveCamera();
    camera.position.z = -10;
    camera.lookAt(0, 0, 0);
    tree.sortLeaves(camera);
    study = tree.createTwigStudy();
    const [twig, attached] = study.group.children;
    assert.ok(attached.count >= 3 && attached.count < 20);
    assert.equal(twig.material, wood.material);
    assert.equal(twig.customDepthMaterial, wood.customDepthMaterial);
    assert.equal(attached.material, leaves.material);
    assert.equal(attached.customDepthMaterial, leaves.customDepthMaterial);
    const origin = new Vector3().fromBufferAttribute(twig.geometry.getAttribute('position'), 0);
    assert.ok(origin.x < -1 && origin.y < 3);
    const rootShape = twig.geometry.getAttribute('twigShape');
    for (let i = 0; i < 6; i++) assert.equal(rootShape.getW(i), 0, 'entire attachment ring remains fixed');
    const matrix = new Matrix4();
    for (let slot = 0; slot < attached.count; slot++) {
      attached.getMatrixAt(slot, matrix);
      const id = Array.from({length: leaves.count}, (_, i) => i).find(i => matrix.elements.every((value, j) => value === matrices[i * 16 + j]));
      assert.notEqual(id, undefined);
      names.forEach((name, i) => {
        const attribute = attached.geometry.getAttribute(name);
        const width = attribute.itemSize;
        assert.deepEqual(attribute.array.slice(slot * width, (slot + 1) * width), original[i].slice(id * width, (id + 1) * width));
      });
    }
    const disposed = new Set();
    for (const resource of [twig.geometry, attached.geometry, attached, twig.material, attached.material]) {
      resource.addEventListener('dispose', () => disposed.add(resource));
    }
    study.dispose();
    assert.equal(disposed.size, 3, 'shared surface materials outlive the study');
    study = undefined;
  } finally { study?.dispose(); tree.dispose(); }
});

test('disposing the tree releases all mesh geometries and materials', () => {
  const tree = createGardenTree();
  const resources = new Set();
  const disposed = new Set();
  tree.group.traverse((object) => {
    if (!object.isMesh) return;
    resources.add(object.geometry);
    resources.add(object.material);
    if (object.customDepthMaterial) resources.add(object.customDepthMaterial);
  });
  for (const resource of resources) resource.addEventListener('dispose', () => disposed.add(resource));
  tree.dispose();
  assert.equal(tree.group.children.length, 0);
  assert.equal(disposed.size, resources.size);
});
