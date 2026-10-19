import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MeshPhysicalMaterial, MeshDepthMaterial } from 'three';
import { leafEdgeShape, leafBladeShape, createLeafMotion } from '../src/lib/garden-leaf-motion.ts';

test('edge flutter alone leaves attachments, tips and the entire midrib stationary', () => {
  for (const across of [-1, -.5, 0, .5, 1]) {
    assert.deepEqual(leafEdgeShape(0, across), [0, 0, 0, 0]);
    assert.deepEqual(leafEdgeShape(1, across), [0, 0, 0, 0]);
  }
  for (const along of [0, .16, .38, .62, .83, 1]) {
    assert.deepEqual(leafEdgeShape(along, 0), [0, 0, 0, 0]);
  }
});

test('flex increases toward each edge and normal gradients match the deformation', () => {
  const width = y => .245 * Math.sin(y * Math.PI) ** .85;
  const weight = (x, y) => leafEdgeShape(y, x / width(y))[0];
  for (const y of [.16, .38, .62, .83]) {
    assert.ok(leafEdgeShape(y, .5)[0] < leafEdgeShape(y, 1)[0]);
    for (const across of [-.75, -.25, .25, .75]) {
      const [value, dx, dy, side] = leafEdgeShape(y, across);
      const x = width(y) * across, h = 1e-6;
      assert.ok(value >= 0 && value <= 1);
      assert.equal(side, Math.sign(across));
      assert.ok(Math.abs(dx - (weight(x + h, y) - weight(x - h, y)) / (2 * h)) < 1e-5);
      assert.ok(Math.abs(dy - (weight(x, y + h) - weight(x, y - h)) / (2 * h)) < 1e-5);
    }
  }
});

test('blade bending fixes the base and increases smoothly toward the tip', () => {
  for (const y of [0, .08, .16]) assert.deepEqual(leafBladeShape(y), [0, 0]);
  let previous = 0;
  for (const y of [.2, .38, .62, .83, 1]) {
    const [weight, gradient] = leafBladeShape(y);
    assert.ok(weight > previous && weight <= 1);
    assert.ok(gradient > 0);
    const h = 1e-6;
    const difference = (leafBladeShape(y + h)[0] - leafBladeShape(y - h)[0]) / (2 * h);
    assert.ok(Math.abs(gradient - difference) < 1e-8, 'lighting follows the actual blade curvature');
    previous = weight;
  }
  assert.equal(leafBladeShape(1)[0], 1, 'tip motion is bounded by the configured amplitude');
  assert.ok(leafBladeShape(.160001)[1] < .00001, 'there is no hinge at the fixed base');
});

test('surface and shadow share an eight-second clock and a true static baseline', () => {
  const motion = createLeafMotion();
  const materials = [new MeshPhysicalMaterial(), new MeshDepthMaterial()];
  try {
    const shaders = materials.map(material => {
      motion.apply(material);
      const shader = { uniforms: {}, vertexShader: '#include <beginnormal_vertex>\n#include <begin_vertex>' };
      material.onBeforeCompile(shader, null);
      return shader;
    });
    assert.equal(shaders[0].uniforms.leafMotionTime, shaders[1].uniforms.leafMotionTime);
    assert.equal(shaders[0].uniforms.leafEdgeStrength, shaders[1].uniforms.leafEdgeStrength);
    assert.equal(shaders[0].uniforms.leafBladeStrength, shaders[1].uniforms.leafBladeStrength);
    assert.equal(shaders[0].uniforms.leafEdgeStrength.value, 0);
    assert.equal(shaders[0].uniforms.leafBladeStrength.value, 0);
    motion.setEdgesEnabled(true);
    assert.equal(shaders[0].uniforms.leafEdgeStrength.value, .01);
    motion.setBladesEnabled(true);
    assert.equal(shaders[0].uniforms.leafBladeStrength.value, .05);
    motion.setTime(1.25);
    const first = shaders[0].uniforms.leafMotionTime.value;
    motion.setTime(9.25);
    assert.equal(shaders[0].uniforms.leafMotionTime.value, first);
    motion.setEdgesEnabled(false);
    assert.equal(shaders[0].uniforms.leafEdgeStrength.value, 0);
    assert.equal(shaders[0].uniforms.leafBladeStrength.value, .05, 'each layer can run independently');
    motion.setEdgesEnabled(true);
    motion.setBladesEnabled(false);
    assert.equal(shaders[0].uniforms.leafEdgeStrength.value, .01);
    assert.equal(shaders[0].uniforms.leafBladeStrength.value, 0);
    motion.setEdgesEnabled(false);
    assert.equal(shaders[0].uniforms.leafEdgeStrength.value, 0);
  } finally { materials.forEach(material => material.dispose()); }
});
