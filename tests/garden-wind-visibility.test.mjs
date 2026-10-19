import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createGardenTree } from '../src/lib/garden-tree.ts';
import { branchFlex } from '../src/lib/garden-branch-motion.ts';
import { twigWave } from '../src/lib/garden-twig-motion.ts';
import { windEnvelope } from '../src/lib/garden-wind-field.ts';

test('whole-tree leaf motion is visible at the normal desktop scale without excessive displacement', () => {
  const tree = createGardenTree();
  try {
    const [wood, leaves] = tree.group.children;
    const bounds = new THREE.Box3().setFromObject(tree.group);
    const size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
    // The regular 1280 × 720 page has a 1120 × 468 canvas. Match its camera fit.
    const width = 1120, height = 468, aspect = width / height;
    const halfHeight = Math.max(size.y * .56, Math.max(size.x, size.z) * .58 / aspect);
    const camera = new THREE.OrthographicCamera(-halfHeight * aspect, halfHeight * aspect, halfHeight, -halfHeight, .1, 100);
    camera.position.set(0, center.y + 3.2, 18); camera.lookAt(0, center.y, 0); camera.updateMatrixWorld();
    const g = leaves.geometry, branch = g.getAttribute('branchBend'), shape = g.getAttribute('branchShape');
    const twig = g.getAttribute('twigBend'), twigShape = g.getAttribute('twigShape');
    const phase = g.getAttribute('windPhase'), blade = g.getAttribute('leafBladeVariation');
    const matrix = new THREE.Matrix4(), point = new THREE.Vector3();
    const ranges = [], oldRanges = [];
    // Sample every fifth leaf across the complete deterministic tree, including lower branches.
    for (let i = 0; i < leaves.count; i += 5) {
      leaves.getMatrixAt(i, matrix);
      const offset = new THREE.Vector3(branch.getX(i), branch.getY(i), branch.getZ(i));
      const gradient = new THREE.Vector3(shape.getX(i), shape.getY(i), shape.getZ(i));
      const twigOffset = new THREE.Vector3(twig.getX(i), twig.getY(i), twig.getZ(i));
      const twigGradient = new THREE.Vector3(twigShape.getX(i), twigShape.getY(i), twigShape.getZ(i));
      for (const enabled of [false, true]) {
        const points = [];
        for (let time = 0; time < 8; time += .25) {
          const breeze = windEnvelope(time, phase.getX(i));
          point.set(0, 1, .025 + .05 * blade.getY(i) * twigWave(time, blade.getX(i)) * breeze);
          point.addScaledVector(twigOffset, twigWave(time, twig.getW(i)) * breeze * (twigShape.getW(i) + twigGradient.dot(point)));
          if (enabled) point.addScaledVector(offset, twigWave(time, branch.getW(i)) * windEnvelope(time, phase.getY(i))
            * branchFlex(shape.getW(i) + gradient.dot(point))[0]);
          point.applyMatrix4(matrix).project(camera);
          points.push(new THREE.Vector2(point.x * width / 2, point.y * height / 2));
        }
        let distance = 0;
        for (const a of points) for (const b of points) distance = Math.max(distance, a.distanceTo(b));
        (enabled ? ranges : oldRanges).push(distance);
      }
    }
    ranges.sort((a, b) => a - b); oldRanges.sort((a, b) => a - b);
    const median = ranges[Math.floor(ranges.length * .5)];
    assert.ok(oldRanges[Math.floor(oldRanges.length * .5)] < 1, 'reproduces the former subpixel median');
    // The requested 3% cluster sway keeps subtle motion while reducing the whole-canopy excursion.
    assert.ok(median > 1 && median < 2, `normal-view median displacement: ${median}px`);
    assert.ok(ranges[Math.floor(ranges.length * .95)] < 4, 'most leaves must retain a gentle excursion');
    assert.ok(ranges.at(-1) < 5, 'outlying shoots must not whip across the canopy');
    const position = wood.geometry.getAttribute('position'), bends = wood.geometry.getAttribute('branchBend');
    for (let i = 0; i < position.count; i++) {
      if (position.getY(i) < 1.4 && Math.abs(position.getX(i)) < .3 && Math.abs(position.getZ(i)) < .3) {
        assert.equal(bends.getX(i) ** 2 + bends.getY(i) ** 2 + bends.getZ(i) ** 2, 0, 'the trunk remains anchored');
      }
    }
    assert.deepEqual(tree.group.rotation.toArray().slice(0, 3), [0, 0, 0]);
  } finally { tree.dispose(); }
});
