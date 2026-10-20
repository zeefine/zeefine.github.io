import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGardenGrass, GRASS } from '../src/lib/garden-grass.ts';

test('meadow geometry is deterministic, finite and leaves room around the trunk', () => {
  const first = createGardenGrass(), second = createGardenGrass();
  try {
    const grass = first.group.children[0];
    const positions = grass.geometry.getAttribute('position');
    const bends = grass.geometry.getAttribute('grassBend');
    // The wider meadow keeps its original coverage, within a 150k-vertex budget.
    assert.ok(positions.count > 10000 && positions.count < 150000);
    const bladeCount = positions.count / ((GRASS.segments + 1) * 2);
    const bladesPerArea = bladeCount / (Math.PI * GRASS.radiusX * GRASS.radiusZ);
    assert.ok(bladesPerArea > 180 && bladesPerArea < 250,
      `grass coverage must not thin out as the footprint widens: ${bladesPerArea}`);
    assert.deepEqual(positions.array, second.group.children[0].geometry.getAttribute('position').array);
    for (const mesh of first.group.children) {
      for (const attribute of Object.values(mesh.geometry.attributes)) assert.ok(attribute.array.every(Number.isFinite));
      assert.ok(mesh.geometry.index.array.every(i => i < mesh.geometry.getAttribute('position').count));
    }
    for (let i = 0; i < positions.count; i += (GRASS.segments + 1) * 2) {
      assert.equal(bends.getX(i), 0, 'blade roots cannot move in wind');
      assert.ok(Math.hypot(positions.getX(i), positions.getZ(i)) > .06, 'no blades through the trunk');
      assert.equal(bends.getX(i + GRASS.segments * 2), 1);
      assert.ok(positions.getY(i + GRASS.segments * 2) - positions.getY(i) < .65);
    }
    const soilColors = first.group.children[1].geometry.getAttribute('color');
    assert.equal(soilColors.getW(soilColors.count - 1), 0, 'ground fades at its edge');
  } finally { first.dispose(); second.dispose(); }
});

test('grass follows one clock, supports static rendering, and releases its resources', () => {
  const meadow = createGardenGrass();
  const shader = { uniforms: {}, vertexShader: '#include <begin_vertex>' };
  const resources = meadow.group.children.flatMap(mesh => [mesh.geometry, mesh.material]);
  let disposed = 0;
  resources.forEach(resource => resource.addEventListener('dispose', () => disposed++));
  meadow.group.children[0].material.onBeforeCompile(shader, null);
  meadow.update(3.5);
  assert.equal(shader.uniforms.grassTime.value, 3.5);
  meadow.setMotion(false);
  assert.equal(shader.uniforms.grassMotion.value, 0);
  meadow.setMotion(true);
  assert.equal(shader.uniforms.grassTime.value, 3.5, 'resume does not restart wind');
  assert.equal(shader.uniforms.grassMotion.value, 1);
  meadow.dispose();
  assert.equal(disposed, resources.length);
  assert.equal(meadow.group.children.length, 0);
});

test('the front silhouette has no detached grass islands at either end', () => {
  const meadow = createGardenGrass();
  try {
    const positions = meadow.group.children[0].geometry.getAttribute('position');
    const roots = [];
    for (let i = 0; i < positions.count; i += (GRASS.segments + 1) * 2) {
      roots.push((positions.getX(i) + positions.getX(i + 1)) / 2);
    }
    roots.sort((a, b) => a - b);
    for (let i = 1; i < roots.length; i++) {
      if (Math.abs(roots[i]) < GRASS.radiusX * .65) continue;
      assert.ok(roots[i] - roots[i - 1] < .05,
        `edge gap between ${roots[i - 1]} and ${roots[i]}`);
    }
  } finally { meadow.dispose(); }
});
