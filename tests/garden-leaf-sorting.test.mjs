import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createLeafSorter } from '../src/lib/garden-leaf-sorting.ts';

function fixture() {
  const geometry = new THREE.PlaneGeometry(1, 1);
  const material = new THREE.MeshBasicMaterial();
  const leaves = new THREE.InstancedMesh(geometry, material, 4);
  geometry.setAttribute('leafEdgeVariation', new THREE.InstancedBufferAttribute(new Float32Array([
    0, .2, .8, .1, 1, .3, .9, .2, 2, .4, 1, .15, 3, .5, .85, .12,
  ]), 4));
  geometry.setAttribute('leafBladeVariation', new THREE.InstancedBufferAttribute(new Float32Array([
    .1, .7, .3, .8, .5, .9, .7, 1,
  ]), 2));
  for (const name of ['twigBend', 'twigShape']) geometry.setAttribute(name,
    new THREE.InstancedBufferAttribute(new Float32Array([.1, .2, .3, 0, .4, .5, .6, 1, .7, .8, .9, 2, 1, 1.1, 1.2, 3]), 4));
  geometry.setAttribute('windPhase', new THREE.InstancedBufferAttribute(new Float32Array([.1, .2, .3, .4]), 1));
  const matrices = [];
  const colors = [];
  const depths = [2, -3, 0, -3];
  for (let index = 0; index < 4; index++) {
    const matrix = new THREE.Matrix4().makeTranslation(index, 0, depths[index]);
    const color = new THREE.Color().setRGB((index + 1) / 5, (index + 1) / 6, (index + 1) / 7);
    matrices.push(matrix.clone());
    colors.push(color.clone());
    leaves.setMatrixAt(index, matrix);
    leaves.setColorAt(index, color);
  }
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  const dispose = () => { leaves.dispose(); geometry.dispose(); material.dispose(); };
  return { leaves, camera, matrices, colors, dispose };
}

function ids(leaves) {
  const matrix = new THREE.Matrix4();
  return Array.from({ length: leaves.count }, (_, slot) => {
    leaves.getMatrixAt(slot, matrix);
    return matrix.elements[12];
  });
}

test('front and back views sort far to near, with stable equal-depth ordering', () => {
  const { leaves, camera, dispose } = fixture();
  try {
    const sort = createLeafSorter(leaves);
    sort(camera);
    assert.deepEqual(ids(leaves), [1, 3, 2, 0]);
    camera.position.set(0, 0, -10);
    camera.lookAt(0, 0, 0);
    sort(camera);
    assert.deepEqual(ids(leaves), [0, 2, 1, 3]);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    sort(camera);
    assert.deepEqual(ids(leaves), [1, 3, 2, 0]);
  } finally { dispose(); }
});

test('matrices, colors and all three motion layers keep their association through sorting', () => {
  const { leaves, camera, matrices, colors, dispose } = fixture();
  try {
    const sort = createLeafSorter(leaves, ['leafEdgeVariation', 'leafBladeVariation', 'twigBend', 'twigShape', 'windPhase']);
    const variation = leaves.geometry.getAttribute('leafEdgeVariation');
    const originalVariation = variation.array.slice();
    const bladeVariation = leaves.geometry.getAttribute('leafBladeVariation');
    const originalBladeVariation = bladeVariation.array.slice();
    const twigAttributes = ['twigBend', 'twigShape'].map(name => leaves.geometry.getAttribute(name));
    const originalTwigs = twigAttributes.map(attribute => attribute.array.slice());
    const windPhase = leaves.geometry.getAttribute('windPhase');
    const originalWindPhase = windPhase.array.slice();
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    for (const z of [10, -10, 10]) {
      camera.position.set(0, 0, z);
      camera.lookAt(0, 0, 0);
      sort(camera);
      for (let slot = 0; slot < leaves.count; slot++) {
        const id = ids(leaves)[slot];
        assert.deepEqual(variation.array.slice(slot * 4, slot * 4 + 4), originalVariation.slice(id * 4, id * 4 + 4));
        assert.deepEqual(bladeVariation.array.slice(slot * 2, slot * 2 + 2), originalBladeVariation.slice(id * 2, id * 2 + 2));
        twigAttributes.forEach((attribute, i) => assert.deepEqual(attribute.array.slice(slot * 4, slot * 4 + 4), originalTwigs[i].slice(id * 4, id * 4 + 4)));
        assert.equal(windPhase.getX(slot), originalWindPhase[id]);
        leaves.getMatrixAt(slot, matrix);
        leaves.getColorAt(slot, color);
        assert.deepEqual(matrix.elements, matrices[id].elements);
        assert.ok(Math.abs(color.r - colors[id].r) < 1e-7);
        assert.ok(Math.abs(color.g - colors[id].g) < 1e-7);
        assert.ok(Math.abs(color.b - colors[id].b) < 1e-7);
      }
    }
  } finally { dispose(); }
});

test('depth uses the transformed leaf center and updates after its parent rotates', () => {
  const geometry = new THREE.PlaneGeometry(1, 1).translate(0, 0, 1);
  const material = new THREE.MeshBasicMaterial();
  const leaves = new THREE.InstancedMesh(geometry, material, 2);
  leaves.setMatrixAt(0, new THREE.Matrix4().makeRotationY(Math.PI));
  leaves.setMatrixAt(1, new THREE.Matrix4());
  leaves.setColorAt(0, new THREE.Color(1, 0, 0));
  leaves.setColorAt(1, new THREE.Color(0, 1, 0));
  const parent = new THREE.Group();
  parent.add(leaves);
  const camera = new THREE.PerspectiveCamera();
  camera.position.z = 10;
  camera.lookAt(0, 0, 0);
  try {
    const sort = createLeafSorter(leaves);
    sort(camera);
    assert.deepEqual(Array.from(leaves.instanceColor.array), [1, 0, 0, 0, 1, 0]);
    parent.rotation.y = Math.PI;
    sort(camera);
    assert.deepEqual(Array.from(leaves.instanceColor.array), [0, 1, 0, 1, 0, 0]);
  } finally { leaves.dispose(); geometry.dispose(); material.dispose(); }
});

test('unchanged views never re-upload buffers', () => {
  const { leaves, camera, dispose } = fixture();
  try {
    const sort = createLeafSorter(leaves, ['leafEdgeVariation', 'leafBladeVariation', 'twigBend', 'twigShape', 'windPhase']);
    sort(camera);
    const versions = () => [leaves.instanceMatrix.version, leaves.instanceColor.version,
      ...['leafEdgeVariation', 'leafBladeVariation', 'twigBend', 'twigShape', 'windPhase'].map(name => leaves.geometry.getAttribute(name).version)];
    const initial = versions();
    for (let frame = 0; frame < 120; frame++) {
      sort(camera);
    }
    assert.deepEqual(versions(), initial);
    camera.position.z += 1;
    sort(camera);
    assert.deepEqual(versions(), initial, 'a changed transform with the same order also needs no upload');
    camera.position.z = -10;
    camera.lookAt(0, 0, 0);
    sort(camera);
    assert.deepEqual(versions(), initial.map((version) => version + 1));
  } finally { dispose(); }
});

test('growth refresh re-sorts changed canonical instances even when the camera is stationary', () => {
  const { leaves, camera, matrices, colors, dispose } = fixture();
  try {
    const variation = leaves.geometry.getAttribute('leafBladeVariation');
    const canonical = variation.array.slice();
    const sort = createLeafSorter(leaves, ['leafBladeVariation']);
    sort(camera);
    // Simulate a growth frame writing every instance in its stable identity order.
    matrices[0].elements[14] = -8;
    matrices.forEach((matrix, i) => { leaves.setMatrixAt(i, matrix); leaves.setColorAt(i, colors[i]); });
    variation.array.set(canonical);
    sort.refresh(); sort(camera);
    assert.deepEqual(ids(leaves), [0, 1, 3, 2]);
    ids(leaves).forEach((id, slot) => assert.deepEqual(variation.array.slice(slot * 2, slot * 2 + 2), canonical.slice(id * 2, id * 2 + 2)));
    const version = leaves.instanceMatrix.version;
    sort(camera);
    assert.equal(leaves.instanceMatrix.version, version, 'the static fast path resumes after the last growth frame');
  } finally { dispose(); }
});
