import * as THREE from 'three';
import { windPhaseAt } from './garden-wind-field.ts';

export type BranchWind = {
  origin: THREE.Vector3; gradient: THREE.Vector3; offset: THREE.Vector3;
  phase: number; envelopePhase: number;
};

/** One small branch and all its descendants share a fixed-root deformation field. */
export function createBranchWind(curve: THREE.CatmullRomCurve3, phase: number, strength: number): BranchWind {
  const origin = curve.getPoint(0);
  const axis = curve.getPoint(1).sub(origin).normalize();
  const length = curve.getLength();
  // Prefer a bend visible from the front, with very little depth travel.
  const direction = new THREE.Vector3(axis.y, -axis.x, 0);
  if (direction.lengthSq() < 1e-8) direction.set(1, 0, 0);
  if (direction.x < 0) direction.negate();
  direction.normalize().add(new THREE.Vector3(0, 0, .12));
  direction.addScaledVector(axis, -direction.dot(axis)).normalize();
  return {
    origin,
    gradient: axis.clone().divideScalar(length * 1.3),
    offset: direction.multiplyScalar(length * .03 * THREE.MathUtils.clamp(strength, 0, 1)),
    phase: ((phase % 1) + 1) % 1,
    envelopePhase: windPhaseAt(curve.getPoint(.5)),
  };
}

/** Saturation lets distal shoots follow the branch without unbounded tip motion. */
export function branchFlex(coordinate: number): readonly [number, number] {
  const u = THREE.MathUtils.clamp(coordinate, 0, 1);
  return [u * u * (3 - 2 * u), 6 * u * (1 - u)];
}

/** The affine coordinate is shared by wood and leaves, including child attachments. */
export function branchSample(position: THREE.Vector3, wind?: BranchWind, leafMatrix?: THREE.Matrix4) {
  if (!wind) return { bend: [0, 0, 0, 0], shape: [0, 0, 0, 0] };
  const coordinate = position.clone().sub(wind.origin).dot(wind.gradient);
  const offset = wind.offset.clone();
  const gradient = wind.gradient.clone();
  if (leafMatrix) {
    const linear = new THREE.Matrix3().setFromMatrix4(leafMatrix);
    offset.applyMatrix3(linear.clone().invert());
    gradient.applyMatrix3(linear.transpose());
  }
  return { bend: [...offset.toArray(), wind.phase], shape: [...gradient.toArray(), coordinate] };
}
