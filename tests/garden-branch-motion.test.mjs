import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createBranchWind, branchSample, branchFlex } from '../src/lib/garden-branch-motion.ts';
import { twigWave } from '../src/lib/garden-twig-motion.ts';
import { windEnvelope } from '../src/lib/garden-wind-field.ts';

const curve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-2, 2, .1), new THREE.Vector3(-2.2, 2.25, .2), new THREE.Vector3(-2.6, 2.5, .3),
]);

test('a leaf-bearing branch anchors its root, bends smoothly and bounds descendant motion', () => {
  const wind = createBranchWind(curve, .2, 1);
  const root = branchSample(curve.getPoint(0), wind);
  assert.equal(branchFlex(root.shape[3])[0], 0);
  assert.equal(branchFlex(root.shape[3])[1], 0);
  for (const u of [-1, 0, .1, .3, .7, .99, 1, 2]) {
    const [weight, derivative] = branchFlex(u);
    assert.ok(weight >= 0 && weight <= 1);
    assert.ok(derivative >= 0 && derivative <= 1.5);
    const h = 1e-6;
    assert.ok(Math.abs(derivative - (branchFlex(u + h)[0] - branchFlex(u - h)[0]) / (2 * h)) < 1e-5);
  }
  assert.deepEqual(branchSample(curve.getPoint(.4), undefined), { bend: [0, 0, 0, 0], shape: [0, 0, 0, 0] });
});

test('connected descendants and transformed leaves share exactly the same branch deformation', () => {
  const wind = createBranchWind(curve, .2, .9);
  const attachment = curve.getPoint(.7);
  const matrix = new THREE.Matrix4().compose(attachment,
    new THREE.Quaternion().setFromEuler(new THREE.Euler(.3, -.7, .2)), new THREE.Vector3(.2, .3, .3));
  const leaf = branchSample(attachment, wind, matrix);
  for (const point of [new THREE.Vector3(), new THREE.Vector3(.03, .8, .1)]) {
    const world = point.clone().applyMatrix4(matrix);
    const wood = branchSample(world, wind);
    const u = leaf.shape[3] + new THREE.Vector3(...leaf.shape.slice(0, 3)).dot(point);
    assert.ok(Math.abs(u - wood.shape[3]) < 1e-9);
    for (const seconds of [0, 1, 2, 4, 7.5, 8]) {
      const amount = twigWave(seconds, wind.phase) * windEnvelope(seconds, wind.envelopePhase);
      const a = point.clone().addScaledVector(new THREE.Vector3(...leaf.bend.slice(0, 3)), amount * branchFlex(u)[0]).applyMatrix4(matrix);
      const b = world.clone().addScaledVector(wind.offset, amount * branchFlex(wood.shape[3])[0]);
      assert.ok(a.distanceTo(b) < 1e-9);
    }
  }
  for (let seconds = 0; seconds < 8; seconds += .25) {
    assert.ok(Math.abs(twigWave(seconds, wind.phase) + twigWave(seconds, wind.phase + .5)) < 1e-12);
    assert.ok(Math.abs(twigWave(seconds, wind.phase) - twigWave(seconds + 8, wind.phase)) < 1e-12);
  }
});
