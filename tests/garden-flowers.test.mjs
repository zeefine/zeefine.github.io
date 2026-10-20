import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Box3 } from 'three';
import { createGardenFlowers } from '../src/lib/garden-flowers.ts';

test('five deterministic flower clusters leave the trunk clear and stay below the crown', () => {
  const first = createGardenFlowers(), second = createGardenFlowers();
  try {
    assert.equal(first.group.children.length, 5);
    assert.equal(first.group.children.reduce((sum, cluster) => sum + cluster.children.length, 0), 26);
    const meshes = [], copies = [];
    first.group.traverse(object => { if (object.isMesh) meshes.push(object); });
    second.group.traverse(object => { if (object.isMesh) copies.push(object); });
    let vertices = 0;
    first.group.updateMatrixWorld(true);
    meshes.forEach((mesh, index) => {
      const geometry = mesh.geometry, positions = geometry.getAttribute('position');
      vertices += positions.count;
      assert.deepEqual(positions.array, copies[index].geometry.getAttribute('position').array);
      for (const attribute of Object.values(geometry.attributes)) assert.ok(attribute.array.every(Number.isFinite));
      assert.ok(geometry.index.array.every(i => i >= 0 && i < positions.count));
      const bounds = new Box3().setFromObject(mesh);
      assert.ok(bounds.max.y < 1.55 && bounds.min.y > -.02, 'flowers sit in grass below the branches');
      assert.ok(bounds.min.x > .45 || bounds.max.x < -.45, 'leave the trunk exposed');
    });
    assert.ok(vertices < 30000, 'small flower patch keeps a bounded geometry budget');
    const stem = first.group.children[0].children[0].children[0].geometry;
    const positions = stem.getAttribute('position'), wind = stem.getAttribute('flowerBend');
    for (let i = 0; i < positions.count; i++) {
      if (positions.getY(i) <= 0) assert.equal(wind.getX(i), 0, 'stem roots stay fixed');
    }
  } finally { first.dispose(); second.dispose(); }
});

test('petals and stems share the wind clock, support reduced motion and release all resources', () => {
  const flowers = createGardenFlowers(), materials = new Set(), geometries = new Set();
  flowers.group.traverse(object => {
    if (object.isMesh) { materials.add(object.material); geometries.add(object.geometry); }
  });
  const shaders = [...materials].map(material => {
    const shader = { uniforms: {}, vertexShader: '#include <beginnormal_vertex>\n#include <begin_vertex>',
      fragmentShader: '#include <lights_fragment_end>' };
    material.onBeforeCompile(shader, null);
    return shader;
  });
  flowers.update(2.5);
  for (const shader of shaders) assert.equal(shader.uniforms.flowerTime.value, 2.5);
  flowers.setMotion(false);
  for (const shader of shaders) assert.equal(shader.uniforms.flowerStrength.value, 0);
  flowers.setMotion(true);
  for (const shader of shaders) {
    assert.equal(shader.uniforms.flowerTime.value, 2.5);
    assert.equal(shader.uniforms.flowerStrength.value, 1);
  }
  let disposed = 0;
  for (const resource of [...materials, ...geometries]) resource.addEventListener('dispose', () => disposed++);
  flowers.dispose();
  assert.equal(disposed, materials.size + geometries.size);
  assert.equal(flowers.group.children.length, 0);
});
