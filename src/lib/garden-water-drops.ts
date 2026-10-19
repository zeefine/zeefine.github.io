import * as THREE from 'three';
import { sampleWaterDrop, wateringDrops, type WaterPoint } from './garden-watering-motion.ts';

/** A single reusable draw call; no particles or timers accumulate between clicks. */
export function createWaterDrops(targets: readonly WaterPoint[]) {
  const drops = wateringDrops(targets);
  const geometry = new THREE.SphereGeometry(1, 10, 10);
  const positions = geometry.getAttribute('position');
  for (let i = 0; i < positions.count; i++) {
    const taper = 1 - .55 * Math.max(0, positions.getY(i));
    positions.setX(i, positions.getX(i) * taper);
    positions.setZ(i, positions.getZ(i) * taper);
  }
  geometry.computeVertexNormals();
  const material = new THREE.MeshPhysicalMaterial({
    color: '#78b8e0', roughness: .12, metalness: 0, clearcoat: 1,
    transparent: true, opacity: .8, depthWrite: false,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, drops.length);
  mesh.name = 'Watering drops';
  mesh.visible = false;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const pose = new THREE.Object3D();
  return {
    mesh,
    update(seconds: number) {
      mesh.visible = seconds >= 0;
      if (!mesh.visible) return;
      drops.forEach((drop, index) => {
        const { y, scale } = sampleWaterDrop(drop, seconds);
        pose.position.set(drop.target[0], y, drop.target[2]);
        // Keep the second drop in a column a little smaller.
        const radius = index % 2 === 0 ? .042 : .033;
        pose.scale.set(radius * scale, .105 * scale, radius * scale);
        pose.updateMatrix();
        mesh.setMatrixAt(index, pose.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
    dispose() { mesh.removeFromParent(); mesh.dispose(); geometry.dispose(); material.dispose(); },
  };
}
