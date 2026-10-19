import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTwigWind, twigSample, twigWave, createTwigMotion } from '../src/lib/garden-twig-motion.ts';
import { windEnvelope } from '../src/lib/garden-wind-field.ts';

const curve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-2, 2, .2), new THREE.Vector3(-2.2, 2.12, .25),
  new THREE.Vector3(-2.6, 2.15, .3), new THREE.Vector3(-2.8, 2.1, .35),
]);
const close = (a, b, message) => assert.ok(Math.abs(a - b) < 1e-8, message);

test('one lower twig has a fixed attachment, smooth increasing flex and a bounded tip', () => {
  const wind = createTwigWind(curve, .2, .7, 1);
  const root = twigSample(curve, wind, 0);
  assert.deepEqual(root.shape, [0, 0, 0, 0]);
  let previous = 0;
  for (const t of [.2, .4, .6, .8, 1]) {
    const sample = twigSample(curve, wind, t);
    assert.ok(sample.shape[3] > previous && sample.shape[3] <= 1);
    previous = sample.shape[3];
  }
  close(wind.offset.length(), curve.getLength() * .00896);
  close(twigSample(curve, wind, 1).shape[3], 1);
  assert.deepEqual(twigSample(curve, undefined, .8), { bend: [0, 0, 0, 0], shape: [0, 0, 0, 0] });
});

test('leaf and twig attachments use identical displacement despite nonuniform leaf transforms', () => {
  const wind = createTwigWind(curve, .3, .8, .9);
  for (const t of [.1, .45, .83]) {
    const anchor = curve.getPoint(t);
    const matrix = new THREE.Matrix4().compose(anchor,
      new THREE.Quaternion().setFromEuler(new THREE.Euler(.7, -.4, .3)), new THREE.Vector3(.2, .3, .3));
    const wood = twigSample(curve, wind, t);
    const leaf = twigSample(curve, wind, t, matrix);
    const linear = new THREE.Matrix3().setFromMatrix4(matrix);
    const worldOffset = new THREE.Vector3(...leaf.bend.slice(0, 3)).applyMatrix3(linear);
    assert.ok(worldOffset.distanceTo(wind.offset) < 1e-9);
    assert.equal(wood.shape[3], leaf.shape[3]);
    assert.equal(wood.bend[3], leaf.bend[3]);
    for (const time of [0, 2, 4, 6, 8]) {
      const amount = twigWave(time, wind.phase) * windEnvelope(time, wind.envelopePhase) * wood.shape[3];
      const branchAttachment = anchor.clone().addScaledVector(wind.offset, amount);
      const leafAttachment = new THREE.Vector3(...leaf.bend.slice(0, 3)).multiplyScalar(amount).applyMatrix4(matrix);
      assert.ok(branchAttachment.distanceTo(leafAttachment) < 1e-9);
    }
    // Covectors follow the transpose: local and world dot products must agree.
    const v = new THREE.Vector3(.05, .1, -.03);
    close(new THREE.Vector3(...leaf.shape.slice(0, 3)).dot(v),
      new THREE.Vector3(...wood.shape.slice(0, 3)).dot(v.clone().applyMatrix3(linear)));
  }
});

test('twig motion repeats every eight seconds and half-cycle neighbours oppose each other', () => {
  for (let time = 0; time < 8; time += .125) {
    const wave = twigWave(time, .17);
    assert.ok(Math.abs(wave) <= 1);
    close(wave, twigWave(time + 8, .17));
    close(wave, -twigWave(time, .67));
  }
});

test('twig surface and depth share a clock and switch without replacing existing leaf shaders', () => {
  const time = { value: 2 };
  const motion = createTwigMotion(time);
  const surface = new THREE.MeshPhysicalMaterial();
  const depth = new THREE.MeshDepthMaterial();
  surface.onBeforeCompile = shader => { shader.vertexShader += '\n// existing leaf layers'; };
  const shaders = [surface, depth].map(material => {
    motion.apply(material);
    const shader = { uniforms: {}, vertexShader: '#include <defaultnormal_vertex>\n#include <project_vertex>' };
    material.onBeforeCompile(shader, null);
    return shader;
  });
  assert.ok(shaders[0].vertexShader.includes('// existing leaf layers'));
  assert.equal(shaders[0].uniforms.twigTime, time);
  assert.equal(shaders[1].uniforms.twigTime, time);
  assert.equal(shaders[0].uniforms.twigStrength, shaders[1].uniforms.twigStrength);
  assert.equal(shaders[0].uniforms.twigStrength.value, 0);
  motion.setEnabled(true);
  assert.equal(shaders[0].uniforms.twigStrength.value, 1);
  motion.setEnabled(false);
  assert.equal(shaders[0].uniforms.twigStrength.value, 0);
  surface.dispose(); depth.dispose();
});
