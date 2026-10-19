import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Matrix4, Vector3, OrthographicCamera, MeshPhysicalMaterial, MeshDepthMaterial, MathUtils } from 'three';
import { createGardenTree } from '../src/lib/garden-tree.ts';
import { createLeafMotion } from '../src/lib/garden-leaf-motion.ts';
import { createWaterDrops } from '../src/lib/garden-water-drops.ts';
import { createWateringClock, wateringTargets, wateringDrops, sampleWaterDrop,
  WATERING_SECONDS, WATER_IMPACT_COUNT, WATER_RESPONSE_SECONDS, WATER_LEAF_RESPONSE } from '../src/lib/garden-watering-motion.ts';
import { GARDEN_REFERENCE_FRAME, GARDEN_GROWTH_STAGES } from '../src/lib/garden-growth.ts';

test('water falls monotonically from above, reaches real leaves, and finishes before unlocking', () => {
  for (const stage of GARDEN_GROWTH_STAGES) {
    const tree = createGardenTree(stage);
    try {
      assert.equal(tree.wateringTargets.length, WATER_IMPACT_COUNT);
      const leaves = tree.group.children[1], matrix = new Matrix4();
      const positions = Array.from({ length: leaves.count }, (_, i) => {
        leaves.getMatrixAt(i, matrix);
        return new Vector3(0, .6, 0).applyMatrix4(matrix);
      });
      for (const target of tree.wateringTargets) {
        assert.ok(positions.some(point => point.distanceTo(new Vector3(...target)) < 1e-5));
      }
      const drops = wateringDrops(tree.wateringTargets);
      assert.equal(drops.length, WATER_IMPACT_COUNT * 2);
      for (const drop of drops) {
        assert.ok(drop.startY > Math.max(...tree.wateringTargets.map(point => point[1])));
        assert.equal(sampleWaterDrop(drop, -1).scale, 0);
        let previous = Infinity;
        for (let i = 0; i <= 100; i++) {
          const sample = sampleWaterDrop(drop, drop.delay + drop.duration * i / 100);
          assert.ok(sample.y <= previous);
          assert.ok(sample.scale >= 0 && sample.scale <= 1);
          previous = sample.y;
        }
        assert.ok(Math.abs(previous - drop.target[1]) < 1e-8);
        assert.equal(sampleWaterDrop(drop, WATERING_SECONDS).scale, 0);
        assert.ok(drop.delay + drop.duration + WATER_RESPONSE_SECONDS + .045 < WATERING_SECONDS);
      }
    } finally { tree.dispose(); }
  }
});

test('target selection uses exposed canopy surfaces and is deterministic', () => {
  const points = [[0, 1, 0], [0, 3, 0], [2, 2, 0], [-2, 2, 0]];
  assert.deepEqual(wateringTargets(points), [[0, 3, 0], [2, 2, 0], [-2, 2, 0]]);
  assert.deepEqual(wateringTargets([]), []);
});

test('watering has a finite independent clock, restarts once and never catches up after a pause', () => {
  const clock = createWateringClock();
  clock.advance(5);
  assert.equal(clock.active, false);
  clock.start(); clock.advance(.5);
  assert.equal(clock.seconds, .5);
  // Pausing/visibility suspends frame delivery; no wall-clock timestamp is retained.
  clock.advance(0); clock.advance(NaN); clock.advance(-1);
  assert.equal(clock.seconds, .5);
  clock.start(); assert.equal(clock.seconds, 0);
  clock.advance(WATERING_SECONDS);
  assert.equal(clock.active, false);
  assert.equal(clock.seconds, -1);
  clock.start(); clock.stop(); assert.equal(clock.active, false);
});

test('leaf impact and its shadow share separate uniforms without resetting or changing the breeze', () => {
  const motion = createLeafMotion({ value: 3.2 }, { value: 1 }, [[0, 4, 0]]);
  const materials = [new MeshPhysicalMaterial(), new MeshDepthMaterial()];
  try {
    const shaders = materials.map(material => {
      motion.apply(material);
      const shader = { uniforms: {}, vertexShader: '#include <beginnormal_vertex>\n#include <begin_vertex>' };
      material.onBeforeCompile(shader, null);
      return shader;
    });
    assert.equal(shaders[0].uniforms.wateringTime, shaders[1].uniforms.wateringTime);
    assert.equal(shaders[0].uniforms.wateringImpacts, shaders[1].uniforms.wateringImpacts);
    assert.equal(shaders[0].uniforms.wateringTime.value, -1);
    motion.setBladesEnabled(true); motion.setEdgesEnabled(true);
    motion.setWateringTime(1.2);
    assert.equal(shaders[0].uniforms.wateringTime.value, 1.2);
    assert.equal(shaders[0].uniforms.leafMotionTime.value, 3.2);
    assert.equal(shaders[0].uniforms.leafBladeStrength.value, .05);
    assert.equal(shaders[0].uniforms.leafEdgeStrength.value, .01);
    for (const time of [-1, WATERING_SECONDS, Infinity, NaN]) {
      motion.setWateringTime(time);
      assert.equal(shaders[0].uniforms.wateringTime.value, -1);
    }
  } finally { materials.forEach(material => material.dispose()); }
});

test('drop rendering reuses a bounded instance buffer and disposes all GPU resources', () => {
  const effect = createWaterDrops([[0, 4, 0], [2, 3, 0]]);
  const buffer = effect.mesh.instanceMatrix;
  const resources = [effect.mesh, effect.mesh.geometry, effect.mesh.material], disposed = new Set();
  resources.forEach(resource => resource.addEventListener('dispose', () => disposed.add(resource)));
  try {
    assert.equal(effect.mesh.visible, false);
    assert.equal(effect.mesh.count, 4);
    for (let round = 0; round < 5; round++) {
      for (const seconds of [0, .3, .9, 1.8, -1]) effect.update(seconds);
    }
    assert.equal(effect.mesh.visible, false);
    assert.equal(effect.mesh.instanceMatrix, buffer);
    assert.ok(buffer.array.every(Number.isFinite));
  } finally { effect.dispose(); }
  assert.equal(disposed.size, resources.length);
});

test('watering flex is visible near impacts at the regular desktop scale without whipping leaves', () => {
  const width = 1120, height = 468, frame = GARDEN_REFERENCE_FRAME;
  const halfHeight = Math.max(frame.height * .56, frame.width * .58 / (width / height));
  const camera = new OrthographicCamera(-halfHeight * width / height, halfHeight * width / height, halfHeight, -halfHeight, .1, 100);
  camera.position.set(0, frame.centerY + .45, 18);
  camera.lookAt(0, frame.centerY, 0); camera.updateMatrixWorld();
  const { strength, damping, frequency } = WATER_LEAF_RESPONSE;
  for (const stage of GARDEN_GROWTH_STAGES) {
    const tree = createGardenTree(stage), leaves = tree.group.children[1];
    try {
      const impacts = wateringDrops(tree.wateringTargets).filter((_, i) => i % 2 === 0);
      const variation = leaves.geometry.getAttribute('leafBladeVariation');
      const matrix = new Matrix4(), point = new Vector3(), shifts = [];
      // Isolate watering from the approved breeze; sample the leaves closest to each impact.
      for (let i = 0; i < leaves.count; i++) {
        leaves.getMatrixAt(i, matrix);
        const root = new Vector3().setFromMatrixPosition(matrix);
        const nearby = impacts.map(drop => ({
          drop,
          proximity: 1 - MathUtils.smoothstep(((root.x - drop.target[0]) / 1.05) ** 2
            + ((root.y - drop.target[1]) / .8) ** 2 + ((root.z - drop.target[2]) / 1.05) ** 2, 0, 1),
        })).filter(({ proximity }) => proximity > .5);
        if (!nearby.length) continue;
        const rest = new Vector3(0, 1, .025).applyMatrix4(matrix).project(camera);
        let maximum = 0;
        for (let time = .65; time < WATERING_SECONDS; time += .025) {
          let response = 0;
          for (const { drop, proximity } of nearby) {
            const age = time - drop.delay - drop.duration - variation.getX(i) * .045;
            if (age <= 0 || age >= WATER_RESPONSE_SECONDS) continue;
            const envelope = MathUtils.smoothstep(age, 0, .055) * Math.exp(-damping * age)
              * (1 - MathUtils.smoothstep(age, .65, WATER_RESPONSE_SECONDS));
            const pulse = proximity * envelope * Math.sin(age * frequency * Math.PI * 2);
            if (Math.abs(pulse) > Math.abs(response)) response = pulse;
          }
          point.set(0, 1, .025 + strength * variation.getY(i) * response).applyMatrix4(matrix).project(camera);
          maximum = Math.max(maximum, Math.hypot((point.x - rest.x) * width / 2, (point.y - rest.y) * height / 2));
        }
        shifts.push(maximum);
      }
      shifts.sort((a, b) => a - b);
      assert.ok(shifts.length > 100, 'the response reaches a local group of leaves');
      const median = shifts[Math.floor(shifts.length * .5)];
      assert.ok(median > 1.4 && median < 2.6, `${stage}: median extra tip displacement ${median.toFixed(2)}px`);
      assert.ok(shifts[Math.floor(shifts.length * .95)] < 4, '95% of nearby leaves stay within a gentle 4px displacement');
      assert.ok(shifts.at(-1) < 5, 'outlying leaves cannot whip away from the canopy');
    } finally { tree.dispose(); }
  }
});
