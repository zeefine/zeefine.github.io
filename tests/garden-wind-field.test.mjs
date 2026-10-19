import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MeshPhysicalMaterial, MeshStandardMaterial, MeshDepthMaterial } from 'three';
import { windPhaseAt, windEnvelope } from '../src/lib/garden-wind-field.ts';
import { createLeafMotion } from '../src/lib/garden-leaf-motion.ts';
import { createTwigMotion } from '../src/lib/garden-twig-motion.ts';

const close = (a, b, epsilon = 1e-9) => assert.ok(Math.abs(a - b) < epsilon, `${a} differs from ${b}`);

test('the wind envelope repeats smoothly every eight seconds without amplifying or reversing motion', () => {
  for (const phase of [0, .13, .5, .91]) {
    for (let time = 0; time <= 16; time += .05) {
      const amount = windEnvelope(time, phase);
      assert.ok(amount >= .7 && amount <= 1);
      close(amount, windEnvelope(time + 8, phase));
    }
    const h = 1e-5;
    close(windEnvelope(0, phase), windEnvelope(8, phase));
    close((windEnvelope(h, phase) - windEnvelope(0, phase)) / h,
      (windEnvelope(8, phase) - windEnvelope(8 - h, phase)) / h, 1e-5);
  }
});

test('nearby branches share a breeze while the strength peak travels across the crown', () => {
  const left = windPhaseAt({x: -3, y: 3, z: 0});
  const middle = windPhaseAt({x: 0, y: 3, z: 0});
  const right = windPhaseAt({x: 3, y: 3, z: 0});
  assert.ok(left < middle && middle < right);
  assert.ok((right - left) * 8 > 2 && (right - left) * 8 < 4);
  for (const phase of [left, middle, right]) close(windEnvelope(phase * 8, phase), 1);
  const neighbor = windPhaseAt({x: .05, y: 3.03, z: .02});
  for (let time = 0; time < 8; time += .1) {
    assert.ok(Math.abs(windEnvelope(time, middle) - windEnvelope(time, neighbor)) < .005);
  }
});

test('all leaf and twig surface/depth passes share the comparison switch and clock', () => {
  const time = { value: 3 };
  const travel = { value: 1 };
  const leaf = createLeafMotion(time, travel);
  const twig = createTwigMotion(time, travel);
  const materials = [new MeshStandardMaterial(), new MeshDepthMaterial(), new MeshPhysicalMaterial(), new MeshDepthMaterial()];
  try {
    const shaders = materials.map((material, i) => {
      if (i >= 2) leaf.apply(material);
      twig.apply(material);
      const shader = { uniforms: {}, vertexShader: '#include <beginnormal_vertex>\n#include <begin_vertex>\n#include <defaultnormal_vertex>\n#include <project_vertex>' };
      material.onBeforeCompile(shader, null);
      assert.equal(shader.uniforms.windTravel, travel);
      assert.equal(shader.uniforms.twigTime, time);
      if (i >= 2) assert.equal(shader.uniforms.leafMotionTime, time);
      return shader;
    });
    leaf.setEdgesEnabled(true); leaf.setBladesEnabled(true); twig.setEnabled(true);
    travel.value = 0;
    for (const shader of shaders) assert.equal(shader.uniforms.windTravel.value, 0);
    assert.equal(shaders[2].uniforms.leafEdgeStrength.value, .01);
    assert.equal(shaders[2].uniforms.leafBladeStrength.value, .05);
    assert.equal(time.value, 3, 'comparison must not restart the animation');
    leaf.setEdgesEnabled(false); leaf.setBladesEnabled(false); twig.setEnabled(false);
    assert.equal(shaders[2].uniforms.leafEdgeStrength.value, 0);
    assert.equal(shaders[2].uniforms.leafBladeStrength.value, 0);
    for (const shader of shaders) assert.equal(shader.uniforms.twigStrength.value, 0);
  } finally { materials.forEach(material => material.dispose()); }
});
