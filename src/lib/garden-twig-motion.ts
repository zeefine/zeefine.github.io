import * as THREE from 'three';
import { windPhaseAt, windEnvelopeShader } from './garden-wind-field.ts';

export type TwigWind = { offset: THREE.Vector3; phase: number; length: number; envelopePhase: number };

/** Only terminal twigs receive a wind record; their parent attachment stays fixed. */
export function createTwigWind(curve: THREE.CatmullRomCurve3, phase: number, angle: number, strength: number): TwigWind {
  const length = curve.getLength();
  const tangent = curve.getTangent(.5).normalize();
  const direction = new THREE.Vector3(Math.cos(angle), .12, Math.sin(angle));
  direction.addScaledVector(tangent, -direction.dot(tangent));
  if (direction.lengthSq() < 1e-8) direction.crossVectors(tangent, new THREE.Vector3(0, 1, 0));
  direction.normalize().multiplyScalar(length * .00896 * Math.max(0, Math.min(1, strength)));
  return { offset: direction, phase: ((phase % 1) + 1) % 1, length, envelopePhase: windPhaseAt(curve.getPoint(.5)) };
}

/** Precompute the same arc-length bend at a wood ring or its attached leaf. */
export function twigSample(curve: THREE.CatmullRomCurve3, wind: TwigWind | undefined, t: number, leafMatrix?: THREE.Matrix4) {
  if (!wind) return { bend: [0, 0, 0, 0], shape: [0, 0, 0, 0] };
  const lengths = curve.getLengths();
  const sample = Math.max(0, Math.min(1, t)) * (lengths.length - 1);
  const index = Math.min(Math.floor(sample), lengths.length - 2);
  const distance = THREE.MathUtils.lerp(lengths[index]!, lengths[index + 1]!, sample - index);
  const along = distance / wind.length;
  const offset = wind.offset.clone();
  const gradient = along === 0 ? new THREE.Vector3() : curve.getTangent(t).multiplyScalar(2 * along / wind.length);
  if (leafMatrix) {
    const linear = new THREE.Matrix3().setFromMatrix4(leafMatrix);
    offset.applyMatrix3(linear.clone().invert());
    gradient.applyMatrix3(linear.transpose());
  }
  return { bend: [...offset.toArray(), wind.phase], shape: [...gradient.toArray(), along * along] };
}

export function twigWave(seconds: number, phase: number) {
  const cycles = seconds / 8 + phase + .5;
  const triangle = Math.abs((cycles - Math.floor(cycles)) * 2 - 1);
  return 2 * triangle * triangle * (3 - 2 * triangle) - 1;
}

/** Compose after leaf flex; wood, leaves and their depth passes share this clock. */
export function createTwigMotion(time: { value: number }, travel = { value: 1 }) {
  const strength = { value: 0 };
  return {
    setEnabled(enabled: boolean) { strength.value = enabled ? 1 : 0; },
    apply(material: THREE.Material) {
      const previous = material.onBeforeCompile.bind(material);
      const previousKey = material.customProgramCacheKey();
      material.onBeforeCompile = (shader, renderer) => {
        previous(shader, renderer);
        const hasLeafMotion = shader.vertexShader.includes('vec3 gardenLeafPosition()');
        shader.uniforms.twigTime = time;
        shader.uniforms.twigStrength = strength;
        shader.uniforms.windTravel = travel;
        shader.vertexShader = `
          ${windEnvelopeShader}
          uniform float twigTime;
          uniform float twigStrength;
          attribute vec4 twigBend;
          attribute vec4 twigShape;
          attribute vec4 branchBend;
          attribute vec4 branchShape;
          ${hasLeafMotion ? 'vec3 gardenLeafPosition();' : ''}
          float gardenBranchAmount() {
            float triangle = abs(fract(twigTime * 0.125 + branchBend.w + 0.5) * 2.0 - 1.0);
            return twigStrength * (2.0 * triangle * triangle * (3.0 - 2.0 * triangle) - 1.0)
              * gardenWindEnvelopeAt(twigTime, windPhase.y);
          }
          float gardenTwigAmount() {
            float triangle = abs(fract(twigTime * 0.125 + twigBend.w + 0.5) * 2.0 - 1.0);
            return twigStrength * (2.0 * triangle * triangle * (3.0 - 2.0 * triangle) - 1.0)
              * gardenWindEnvelope(twigTime);
          }
          float gardenTwigWeight(vec3 point) {
            float weight = twigShape.w;
            #ifdef USE_INSTANCING
              weight += dot(twigShape.xyz, point);
            #endif
            return weight;
          }
          vec2 gardenBranchFlex(vec3 point) {
            float coordinate = branchShape.w;
            #ifdef USE_INSTANCING
              coordinate += dot(branchShape.xyz, point);
            #else
              coordinate += dot(branchShape.xyz, point - position);
            #endif
            float u = clamp(coordinate, 0.0, 1.0);
            return vec2(u * u * (3.0 - 2.0 * u), 6.0 * u * (1.0 - u));
          }
          ${shader.vertexShader}`;
        shader.vertexShader = shader.vertexShader
          .replace('#include <defaultnormal_vertex>', `
            // Inverse-transpose of I + wave * offset * gradient^T.
            float twigAmount = gardenTwigAmount();
            objectNormal -= twigShape.xyz * (twigAmount * dot(twigBend.xyz, objectNormal))
              / (1.0 + twigAmount * dot(twigBend.xyz, twigShape.xyz));
            // Apply the parent bend after local leaf/twig flex, including its normal Jacobian.
            vec3 branchPoint = ${hasLeafMotion ? 'gardenLeafPosition()' : 'position'};
            branchPoint += twigBend.xyz * (twigAmount * gardenTwigWeight(branchPoint));
            vec3 branchGradient = branchShape.xyz * gardenBranchFlex(branchPoint).y;
            float branchAmount = gardenBranchAmount();
            objectNormal -= branchGradient * (branchAmount * dot(branchBend.xyz, objectNormal))
              / (1.0 + branchAmount * dot(branchBend.xyz, branchGradient));
            #include <defaultnormal_vertex>`)
          .replace('#include <project_vertex>', `
            transformed += twigBend.xyz * (gardenTwigAmount() * gardenTwigWeight(transformed));
            transformed += branchBend.xyz * (gardenBranchAmount() * gardenBranchFlex(transformed).x);
            #include <project_vertex>`);
      };
      material.customProgramCacheKey = () => `${previousKey}|garden-twig-v3`;
    },
  };
}
