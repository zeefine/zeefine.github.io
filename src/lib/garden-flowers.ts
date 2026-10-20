import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { createFlowerHead, type FlowerKind } from './garden-flower-geometry.ts';
type FlowerPlacement = { x: number; z: number; height: number };
// Five uneven islands, kept clear of the trunk and below the lower branches.
export const FLOWER_CLUSTERS: readonly {
  x: number; z: number; seed: number; kinds: readonly FlowerKind[];
  layout?: readonly FlowerPlacement[];
}[] = [
  { x: -4.1, z: .3, seed: 4816, kinds: ['blue', 'ivory', 'blue', 'pink'] },
  { x: -2.6, z: .85, seed: 553837820, kinds: ['pink', 'blue', 'blue', 'ivory', 'ivory', 'pink', 'blue'],
    // Two pink accents frame a loose mix of smaller flowers. Uneven gaps,
    // heights and depth avoid both overlapping heads and a repeated border.
    layout: [
      { x: -.63, z: .1, height: .78 },
      { x: -.04, z: -.3, height: .91 },
      { x: -.31, z: .37, height: .62 },
      { x: .38, z: -.4, height: 1.09 },
      { x: .92, z: .32, height: .73 },
      { x: 1.38, z: -.5, height: .98 },
      { x: .71, z: .43, height: .58 },
    ] },
  { x: 1.25, z: .65, seed: 791697981, kinds: ['ivory', 'blue', 'pink', 'blue'] },
  { x: 3, z: .15, seed: 2671743385, kinds: ['blue', 'ivory', 'blue', 'pink', 'blue', 'ivory'] },
  { x: 4.55, z: .65, seed: 2448711613, kinds: ['pink', 'blue', 'pink', 'ivory', 'blue'] },
];

function randomSource(seed: number) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

export function createGardenFlowers() {
  const group = new THREE.Group();
  group.name = 'garden-flowers';
  const time = { value: 0 }, strength = { value: 1 };
  const geometries: THREE.BufferGeometry[] = [];
  const stemMaterial = new THREE.MeshStandardMaterial({ color: '#7b926c', roughness: .8, side: THREE.DoubleSide });
  const centerMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .82 });
  const petalMaterial = new THREE.MeshPhysicalMaterial({ vertexColors: true, side: THREE.DoubleSide,
    transparent: true, opacity: 1, depthWrite: false, roughness: .72, metalness: 0,
    clearcoat: .04, clearcoatRoughness: .85, sheen: .2, sheenColor: '#f5e7e7' });
  const pinkPetalMaterial = petalMaterial.clone();
  const materials = [stemMaterial, centerMaterial, petalMaterial, pinkPetalMaterial];
  // All parts of one plant share a smooth bend. The head follows the stem tip,
  // without rotating the flower group or restarting the tree's wind clock.
  for (const material of materials) {
    material.onBeforeCompile = shader => {
      shader.uniforms.flowerTime = time;
      shader.uniforms.flowerStrength = strength;
      shader.vertexShader = `
        uniform float flowerTime;
        uniform float flowerStrength;
        attribute vec4 flowerBend;
        float flowerWind() {
          float p = flowerTime * 0.78539816339 - flowerBend.z;
          return flowerStrength * flowerBend.w * (sin(p) + 0.24 * sin(2.0 * p + 0.8));
        }
      ` + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', `
        #include <beginnormal_vertex>
        objectNormal.y -= flowerWind() * flowerBend.y * (objectNormal.x + objectNormal.z * 0.3);
        objectNormal = normalize(objectNormal);
      `).replace('#include <begin_vertex>', `
        #include <begin_vertex>
        float bend = flowerWind() * flowerBend.x;
        transformed.x += bend;
        transformed.z += bend * 0.3;
      `);
      if (material === pinkPetalMaterial) {
        // Folded buds and downward-facing petals miss the key light. A small
        // color-preserving diffuse floor lifts only their unlit areas; already
        // lit pink petals, other flowers and scene lighting remain unchanged.
        shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_end>', `
          #include <lights_fragment_end>
          vec3 petalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
          reflectedLight.indirectDiffuse += max(vec3(0.0), diffuseColor.rgb * 0.48 - petalDiffuse);
        `);
      }
    };
    material.customProgramCacheKey = () => material === pinkPetalMaterial ? 'garden-flowers-v3-pink-fill' : 'garden-flowers-v2';
  }
  function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, height: number, phase: number, amplitude: number, rigidHead = false) {
    const positions = geometry.getAttribute('position');
    const bend: number[] = [];
    for (let i = 0; i < positions.count; i++) {
      const t = THREE.MathUtils.clamp(positions.getY(i) / height, 0, 1);
      // Smoothstep becomes a constant translation at the flower head; no hinge at the neck.
      bend.push(rigidHead ? 1 : t * t * (3 - 2 * t), rigidHead ? 0 : 6 * t * (1 - t) / height, phase, amplitude);
    }
    geometry.setAttribute('flowerBend', new THREE.Float32BufferAttribute(bend, 4));
    geometry.computeBoundingSphere();
    geometry.boundingSphere!.radius += .06;
    geometries.push(geometry);
    return new THREE.Mesh(geometry, material);
  }

  FLOWER_CLUSTERS.forEach((cluster, clusterIndex) => {
    // Independent seeds keep the other clusters stable when one mix changes.
    const random = randomSource(cluster.seed);
    const island = new THREE.Group();
    island.name = `flower-cluster-${clusterIndex + 1}`;
    group.add(island);
    cluster.kinds.forEach((kind, index) => {
      const bud = index === cluster.kinds.length - 1;
      const placement = cluster.layout?.[index];
      // Placement overrides don't change the random sequence within this cluster.
      const generatedHeight = (kind === 'pink' ? .85 : kind === 'ivory' ? 1.02 : .67) * (.85 + random() * .3);
      const height = placement?.height ?? generatedHeight;
      const radius = (kind === 'pink' ? .25 : kind === 'ivory' ? .19 : .14) * (bud ? .65 : 1) * (.9 + random() * .2);
      const angle = index * 2.39996 + clusterIndex;
      const spread = Math.sqrt((index + .5) / cluster.kinds.length) * .62;
      const plant = new THREE.Group();
      plant.name = `${kind}-${bud ? 'bud' : 'flower'}`;
      plant.position.set(cluster.x + (placement?.x ?? Math.cos(angle) * spread), .025,
        cluster.z + (placement?.z ?? Math.sin(angle) * spread * .45));
      island.add(plant);
      const lean = (random() - .5) * .24;
      const phase = cluster.x * .55 + index * .75;
      const amplitude = kind === 'pink' ? .024 : .035;
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(-lean * .25, height * .45, .025), new THREE.Vector3(lean, height, 0)]);
      const stemParts: THREE.BufferGeometry[] = [new THREE.TubeGeometry(curve, 10, .009, 5, false)];
      for (let leaf = 0; leaf < 3; leaf++) {
        const t = .23 + leaf * .19, side = leaf % 2 ? 1 : -1;
        const base = curve.getPoint(t);
        const leafGeometry = new THREE.SphereGeometry(1, 6, 4);
        leafGeometry.scale(.14, .012, .042);
        leafGeometry.rotateZ(side * .55);
        leafGeometry.translate(base.x + side * .11, base.y + .045, base.z);
        stemParts.push(leafGeometry);
      }
      const stem = mergeGeometries(stemParts);
      stemParts.forEach(part => part.dispose());
      if (!stem) throw new Error('Cannot assemble flower stems');
      plant.add(mesh(stem, stemMaterial, height, phase, amplitude));
      const { petals, center } = createFlowerHead(kind, radius, bud, random);
      const nodding = !bud && (index + clusterIndex) % 7 === 4;
      const tilt = nodding ? 1.58 + random() * .18 : .78 + random() * .48;
      const pose = new THREE.Matrix4().makeRotationFromEuler(
        new THREE.Euler(tilt, (random() - .5) * .7, (random() - .5) * .75, 'YXZ'));
      pose.setPosition(lean, height, 0);
      // Rotate the center and petals together, then translate the entire head
      // with the stem tip. A tilted face must not leave its pollen behind.
      petals.applyMatrix4(pose);
      plant.add(mesh(petals, kind === 'pink' ? pinkPetalMaterial : petalMaterial, height, phase, amplitude, true));
      if (center) {
        center.applyMatrix4(pose);
        plant.add(mesh(center, centerMaterial, height, phase, amplitude, true));
      }
    });
  });
  return {
    group,
    update(seconds: number) { time.value = seconds; },
    setMotion(enabled: boolean) { strength.value = enabled ? 1 : 0; },
    dispose() { group.removeFromParent(); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); group.clear(); },
  };
}
