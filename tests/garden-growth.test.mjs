import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Box3, Vector3, Matrix4 } from 'three';
import { createGardenTree } from '../src/lib/garden-tree.ts';
import { GARDEN_REFERENCE_FRAME, GARDEN_GROWTH_STAGES } from '../src/lib/garden-growth.ts';

function fingerprint(tree) {
  const hash = createHash('sha256');
  for (const mesh of tree.group.children) {
    for (const name of Object.keys(mesh.geometry.attributes).sort()) {
      hash.update(name);
      hash.update(Buffer.from(mesh.geometry.attributes[name].array.buffer));
    }
    hash.update(Buffer.from(mesh.geometry.index.array.buffer));
    if (mesh.isInstancedMesh) {
      hash.update(Buffer.from(mesh.instanceMatrix.array.buffer));
      hash.update(Buffer.from(mesh.instanceColor.array.buffer));
    }
  }
  return hash.digest('hex');
}

test('the mature stage preserves the approved tree geometry, colors and wind attributes', () => {
  const tree = createGardenTree('mature');
  try {
    // Captured before introducing growth; includes every geometry/instance attribute.
    assert.equal(fingerprint(tree), '9f74e192e8c819af4a6ba5a997e3cceb115dc5759efc86358e15ce6f8d3fff05');
    const bounds = new Box3().setFromObject(tree.group);
    const size = bounds.getSize(new Vector3());
    for (const [actual, expected] of [[size.x, GARDEN_REFERENCE_FRAME.width], [size.y, GARDEN_REFERENCE_FRAME.height],
      [size.z, GARDEN_REFERENCE_FRAME.depth], [bounds.getCenter(new Vector3()).y, GARDEN_REFERENCE_FRAME.centerY]]) {
      assert.ok(Math.abs(actual - expected) < .001, 'the fixed camera matches the approved mature frame');
    }
  } finally { tree.dispose(); }
});

test('adding the medium stage preserves the existing small tree', () => {
  assert.deepEqual(GARDEN_GROWTH_STAGES, ['growing', 'medium', 'mature']);
  const tree = createGardenTree('growing');
  try {
    assert.equal(fingerprint(tree), '6e823295c0f0e84a1dceb29f8ecb13f0fa14f5eaff960bc8cbd615533adb83f6');
  } finally { tree.dispose(); }
});

test('growth adds branches and leaves, extends the crown and thickens the trunk without scaling the tree', () => {
  const trees = GARDEN_GROWTH_STAGES.map(stage => createGardenTree(stage));
  try {
    const sizes = trees.map(tree => new Box3().setFromObject(tree.group).getSize(new Vector3()));
    const rootWidths = trees.map(tree => {
      const p = tree.group.children[0].geometry.getAttribute('position');
      const xs = Array.from({length: 10}, (_, i) => p.getX(i));
      return Math.max(...xs) - Math.min(...xs);
    });
    for (let i = 0; i < trees.length - 1; i++) {
      assert.ok(trees[i].stats.leaves < trees[i + 1].stats.leaves);
      assert.ok(trees[i].stats.branches < trees[i + 1].stats.branches);
      assert.ok(sizes[i].x < sizes[i + 1].x && sizes[i].y < sizes[i + 1].y);
      assert.ok(rootWidths[i] < rootWidths[i + 1]);
      // Canonical leaf phases act as stable identities: existing leaves survive growth.
      const early = trees[i].group.children[1].geometry.getAttribute('leafBladeVariation');
      const later = trees[i + 1].group.children[1].geometry.getAttribute('leafBladeVariation');
      const laterIds = new Set(Array.from({length: later.count}, (_, j) => later.getX(j)));
      for (let j = 0; j < early.count; j++) assert.ok(laterIds.has(early.getX(j)));
    }
    assert.ok(trees[2].stats.leaves > trees[0].stats.leaves * 4);
    assert.ok(trees[1].stats.leaves > trees[0].stats.leaves * 2, 'the medium crown is visibly fuller than the small one');
    assert.ok(trees[2].stats.leaves > trees[1].stats.leaves * 1.5, 'the medium crown leaves room for the mature stage');
    assert.ok(sizes[0].y < sizes[2].y * .8, 'the small stage is visibly shorter in the same camera');
    assert.ok(sizes[1].y > sizes[0].y + .5 && sizes[1].y < sizes[2].y - .5, 'the middle height is distinct from both neighbours');
    const matrix = new Matrix4();
    const leafLengths = trees.map(tree => {
      const leaves = tree.group.children[1], lengths = [];
      for (let i = 0; i < leaves.count; i++) {
        leaves.getMatrixAt(i, matrix);
        lengths.push(new Vector3().setFromMatrixColumn(matrix, 1).length());
      }
      return lengths.reduce((sum, n) => sum + n, 0) / lengths.length;
    });
    assert.ok(leafLengths[0] > leafLengths[2] * .85, 'leaves retain their own scale instead of shrinking with the tree');
    for (const tree of trees) assert.deepEqual(tree.group.scale.toArray(), [1, 1, 1]);
  } finally { trees.forEach(tree => tree.dispose()); }
});

test('each stage is deterministic and retains all wind layers and working inspection meshes', () => {
  for (const stage of GARDEN_GROWTH_STAGES) {
    const tree = createGardenTree(stage), repeat = createGardenTree(stage);
    let leafStudy, twigStudy;
    const resources = new Set(), disposed = new Set();
    try {
      assert.equal(fingerprint(tree), fingerprint(repeat));
      const leaves = tree.group.children[1];
      for (const name of ['leafEdgeVariation', 'leafBladeVariation', 'twigBend', 'branchBend', 'windPhase']) {
        const attr = leaves.geometry.getAttribute(name);
        assert.equal(attr.count, leaves.count);
        assert.ok(attr.array.every(Number.isFinite));
        assert.ok(attr.array.some(value => value !== 0));
      }
      const poses = leaves.instanceMatrix.array.slice();
      tree.setLeafEdges(true); tree.setLeafBlades(true); tree.setTwigs(true);
      for (const time of [0, 2, 4, 8]) tree.updateMotion(time);
      assert.deepEqual(leaves.instanceMatrix.array, poses);
      leafStudy = tree.createLeafStudy(); twigStudy = tree.createTwigStudy();
      assert.equal(leafStudy.mesh.count, 1);
      assert.ok(twigStudy.group.children[1].count > 0);
      assert.equal(leaves.material.opacity, .74, 'the approved translucent material is shared by every stage');
      for (const group of [tree.group, repeat.group, twigStudy.group]) group.traverse(mesh => {
        if (!mesh.isMesh) return;
        resources.add(mesh.geometry); resources.add(mesh.material);
        if (mesh.isInstancedMesh) resources.add(mesh);
        if (mesh.customDepthMaterial) resources.add(mesh.customDepthMaterial);
      });
      resources.add(leafStudy.mesh.geometry); resources.add(leafStudy.mesh);
      for (const resource of resources) resource.addEventListener('dispose', () => disposed.add(resource));
    } finally { leafStudy?.dispose(); twigStudy?.dispose(); tree.dispose(); repeat.dispose(); }
    assert.equal(disposed.size, resources.size, 'stage and inspection resources are released together');
  }
});
