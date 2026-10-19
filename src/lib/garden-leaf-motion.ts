import { Vector4, type Material } from 'three';
import { windEnvelopeShader } from './garden-wind-field.ts';
import { WATER_IMPACT_COUNT, WATER_RESPONSE_SECONDS, WATER_LEAF_RESPONSE, WATERING_SECONDS, wateringDrops, type WaterPoint } from './garden-watering-motion.ts';

/** Weight, local X/Y derivatives and side, for the existing narrow leaf mesh. */
export function leafEdgeShape(along: number, across: number): readonly [number, number, number, number] {
  if (along <= 0 || along >= 1 || across === 0) return [0, 0, 0, 0];
  const sine = Math.sin(along * Math.PI);
  const width = .245 * Math.pow(sine, .85);
  return [
    across * across * sine * sine,
    2 * across * sine * sine / width,
    .3 * Math.PI * across * across * sine * Math.cos(along * Math.PI),
    Math.sign(across),
  ];
}

/** Quadratic blade flex and its local Y derivative; the lower 16% is anchored. */
export function leafBladeShape(along: number): readonly [number, number] {
  if (along <= .16) return [0, 0];
  const flex = (along - .16) / .84;
  return [flex * flex, 2 * flex / .84];
}

/** Both layers deform in leaf-local space, before its unchanged instance transform. */
export function createLeafMotion(time = { value: 0 }, travel = { value: 1 }, targets: readonly WaterPoint[] = []) {
  const edgeStrength = { value: 0 };
  const bladeStrength = { value: 0 };
  const waterTime = { value: -1 };
  const drops = wateringDrops(targets);
  const impacts = { value: Array.from({ length: WATER_IMPACT_COUNT }, (_, index) => {
    const drop = drops[index * 2];
    return drop ? new Vector4(...drop.target, drop.delay + drop.duration) : new Vector4(0, 0, 0, 999);
  }) };
  return {
    setWateringTargets(targets: readonly WaterPoint[]) {
      const drops = wateringDrops(targets);
      impacts.value.forEach((impact, index) => {
        const drop = drops[index * 2];
        if (drop) impact.set(...drop.target, drop.delay + drop.duration);
        else impact.set(0, 0, 0, 999);
      });
    },
    setTime(seconds: number) { time.value = Number.isFinite(seconds) ? ((seconds % 8) + 8) % 8 : 0; },
    setWateringTime(seconds: number) {
      waterTime.value = Number.isFinite(seconds) && seconds >= 0 && seconds < WATERING_SECONDS ? seconds : -1;
    },
    setEdgesEnabled(enabled: boolean) { edgeStrength.value = enabled ? .01 : 0; },
    setBladesEnabled(enabled: boolean) { bladeStrength.value = enabled ? .05 : 0; },
    apply(material: Material) {
      material.onBeforeCompile = (shader) => {
        shader.uniforms.leafMotionTime = time;
        shader.uniforms.leafEdgeStrength = edgeStrength;
        shader.uniforms.leafBladeStrength = bladeStrength;
        shader.uniforms.windTravel = travel;
        shader.uniforms.wateringTime = waterTime;
        shader.uniforms.wateringImpacts = impacts;
        shader.vertexShader = `
          ${windEnvelopeShader}
          uniform float leafMotionTime;
          uniform float leafEdgeStrength;
          uniform float leafBladeStrength;
          uniform float wateringTime;
          uniform vec4 wateringImpacts[${WATER_IMPACT_COUNT}];
          attribute vec4 leafEdgeVariation;
          attribute vec2 leafBladeVariation;
          // Derive shapes from the existing mesh to reserve GPU slots for branch motion.
          vec4 gardenEdgeShape() {
            float y = position.y;
            if (y <= 0.0 || y >= 1.0 || position.x == 0.0) return vec4(0.0);
            float sine = sin(y * 3.14159265359);
            float width = 0.245 * pow(sine, 0.85);
            float across = position.x / width;
            return vec4(across * across * sine * sine, 2.0 * across * sine * sine / width,
              0.3 * 3.14159265359 * across * across * sine * cos(y * 3.14159265359), sign(across));
          }
          vec2 gardenBladeShape() {
            float flex = max(0.0, (position.y - 0.16) / 0.84);
            return vec2(flex * flex, 2.0 * flex / 0.84);
          }
          float gardenLeafWave(float phase) {
            float triangle = abs(fract(phase + 0.5) * 2.0 - 1.0);
            return 2.0 * triangle * triangle * (3.0 - 2.0 * triangle) - 1.0;
          }
          float gardenEdgeAmplitude() {
            float sidePhase = gardenEdgeShape().w * leafEdgeVariation.w;
            float slow = gardenLeafWave(leafMotionTime * 0.25 + leafEdgeVariation.x + sidePhase);
            float fast = gardenLeafWave(leafMotionTime * 0.375 + leafEdgeVariation.y - sidePhase);
            return leafEdgeStrength * leafEdgeVariation.z * (0.65 * slow + 0.35 * fast)
              * gardenWindEnvelope(leafMotionTime);
          }
          float gardenBladeAmplitude() {
            return leafBladeStrength * leafBladeVariation.y
              * gardenLeafWave(leafMotionTime * 0.125 + leafBladeVariation.x)
              * gardenWindEnvelope(leafMotionTime);
          }
          float gardenWaterAmplitude() {
            if (wateringTime < 0.0) return 0.0;
            float response = 0.0;
            // Leaf-local flex only: no trunk, branch, camera or instance rotation.
            vec3 attachment = instanceMatrix[3].xyz;
            for (int i = 0; i < ${WATER_IMPACT_COUNT}; i++) {
              vec4 impact = wateringImpacts[i];
              float age = wateringTime - impact.w - fract(leafBladeVariation.x) * 0.045;
              if (age <= 0.0 || age >= ${WATER_RESPONSE_SECONDS}) continue;
              vec3 offset = (attachment - impact.xyz) / vec3(1.05, 0.8, 1.05);
              float proximity = 1.0 - smoothstep(0.0, 1.0, dot(offset, offset));
              float envelope = smoothstep(0.0, 0.055, age) * exp(-${WATER_LEAF_RESPONSE.damping.toFixed(1)} * age)
                * (1.0 - smoothstep(0.65, ${WATER_RESPONSE_SECONDS}, age));
              float pulse = proximity * envelope * sin(age * ${(WATER_LEAF_RESPONSE.frequency * Math.PI * 2).toFixed(8)});
              if (abs(pulse) > abs(response)) response = pulse;
            }
            return ${WATER_LEAF_RESPONSE.strength.toFixed(2)} * leafBladeVariation.y * response;
          }
          vec3 gardenLeafPosition() {
            vec3 point = position;
            point.z += gardenEdgeAmplitude() * gardenEdgeShape().x
              + (gardenBladeAmplitude() + gardenWaterAmplitude()) * gardenBladeShape().x;
            return point;
          }
          ${shader.vertexShader}`;
        shader.vertexShader = shader.vertexShader
          .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
            // Inverse-transpose of the summed local-Z displacement, before instancing.
            vec2 leafGradient = gardenEdgeAmplitude() * gardenEdgeShape().yz
              + vec2(0.0, (gardenBladeAmplitude() + gardenWaterAmplitude()) * gardenBladeShape().y);
            objectNormal.xy -= objectNormal.z * leafGradient;`)
          .replace('#include <begin_vertex>', `#include <begin_vertex>
            transformed = gardenLeafPosition();`);
      };
      material.customProgramCacheKey = () => 'garden-leaf-motion-v6';
    },
  };
}
