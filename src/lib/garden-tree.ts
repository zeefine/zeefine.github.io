import * as THREE from 'three';
import { createLeafSorter } from './garden-leaf-sorting.ts';
import { createLeafMotion } from './garden-leaf-motion.ts';
import { createTwigMotion, createTwigWind, twigSample, type TwigWind } from './garden-twig-motion.ts';
import { createBranchWind, branchSample, type BranchWind } from './garden-branch-motion.ts';
import { windPhaseAt } from './garden-wind-field.ts';
import { GARDEN_GROWTH, type GardenGrowthStage } from './garden-growth.ts';
import { wateringTargets, type WaterPoint } from './garden-watering-motion.ts';
import { createGrowthTransition, type GrowthModel } from './garden-growth-transition.ts';

type Point = readonly [number, number, number];
type Branch = {
  curve: THREE.CatmullRomCurve3; radius: number; depth: number; foliage?: number; droop?: number;
  referenceCurve: THREE.CatmullRomCurve3; visible: boolean;
  parent?: Branch;
  wind?: TwigWind;
  branchWind?: BranchWind;
  range?: { vertexStart: number; vertexCount: number; indexStart: number; indexCount: number };
};

/** The mature silhouette is authored; only its smaller branches and leaves vary. */
const MAIN_BRANCHES: { points: Point[]; radius: number; foliage: number; droop: number; tipScale?: number }[] = [
  // The reference has a long, low left arm, a shorter middle arm and two uneven high leaders.
  { points: [[0.08, 1.72, 0], [-0.9, 2.35, 0.15], [-2.65, 2.65, 0.25], [-3.85, 2.7, 0.2]], radius: 0.078, foliage: 1.1, droop: 0.32 },
  { points: [[0.07, 1.8, 0], [-0.55, 2.25, 0.8], [-1.5, 2.05, 1.3], [-2.4, 1.8, 1.3]], radius: 0.057, foliage: 0.85, droop: 0.42 },
  { points: [[0.02, 2.6, 0], [-1.0, 3.65, 0.12], [-2.25, 4.3, 0.15], [-3.15, 4.6, 0.05]], radius: 0.069, foliage: 0.9, droop: 0.08 },
  { points: [[0.14, 3.25, -0.04], [-0.7, 4.55, -0.2], [-1.5, 5.7, -0.3], [-1.6, 6.2, -0.2]], radius: 0.067, foliage: 1.05, droop: 0.04 },
  { points: [[0.2, 3.7, -0.1], [0.05, 4.6, -0.35], [-0.25, 5.6, -0.15], [-0.25, 6.1, 0]], radius: 0.053, foliage: 0.8, droop: 0.08 },
  { points: [[0.12, 3.15, -0.03], [0.9, 4.25, -0.15], [1.45, 5.5, -0.2], [2.0, 6.25, -0.1]], radius: 0.076, foliage: 1.05, droop: 0.07 },
  { points: [[0.06, 2.8, 0], [1.1, 3.65, 0.1], [2.3, 4.25, 0.35], [3.1, 4.1, 0.4]], radius: 0.062, foliage: 0.95, droop: 0.2 },
  // Several separate hanging sprays, rather than a single rounded right-hand tuft.
  { points: [[0.03, 2.1, 0], [1.05, 2.9, 0.25], [2.55, 2.65, 0.45], [3.15, 2.15, 0.55]], radius: 0.056, foliage: 0.65, droop: 0.62, tipScale: 0.25 },
  { points: [[0.0, 2.35, -0.02], [1.3, 3.0, -0.6], [2.6, 2.85, -0.8], [3.15, 2.3, -0.7]], radius: 0.048, foliage: 0.65, droop: 0.5, tipScale: 0.25 },
  // Overlapping foreground branches hide the radial junction and give the crown depth.
  { points: [[0.02, 2.6, 0], [-0.5, 3.25, 0.9], [-0.9, 4.05, 1.45], [-0.6, 4.45, 1.55]], radius: 0.055, foliage: 1.15, droop: 0.18 },
  { points: [[0.05, 1.95, 0], [-0.55, 2.6, 0.8], [-0.8, 3.0, 1.3], [-0.25, 3.2, 1.5]], radius: 0.045, foliage: 1.0, droop: 0.3 },
  { points: [[0.04, 2.7, 0], [0.65, 3.4, 0.9], [1.2, 3.8, 1.3], [1.6, 3.6, 1.45]], radius: 0.049, foliage: 0.8, droop: 0.3 },
  { points: [[0.0, 2.45, -0.02], [-0.8, 3.5, -0.9], [-1.9, 4.5, -1.45], [-1.9, 5.0, -1.5]], radius: 0.06, foliage: 0.95, droop: 0.12 },
  { points: [[0.12, 3.05, -0.03], [0.6, 4.0, -1.05], [1.1, 4.6, -1.5], [1.5, 5.0, -1.6]], radius: 0.055, foliage: 0.8, droop: 0.16 },
];

function randomSource(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function curveThrough(points: Point[]) {
  return new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)), false, 'centripetal');
}

function makeBark(random: () => number): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.fillStyle = '#8d897b';
  context.fillRect(0, 0, 256, 512);
  // Long, broken ridges read as bark at normal viewing distance, without an asset request.
  for (let stroke = 0; stroke < 950; stroke++) {
    const x = random() * 256;
    const y = random() * 512;
    const length = 8 + random() * 110;
    const light = random() > 0.64;
    context.strokeStyle = light ? `rgba(190,184,155,${0.08 + random() * 0.18})` : `rgba(35,41,31,${0.04 + random() * 0.16})`;
    context.lineWidth = 0.4 + random() * 2.2;
    context.beginPath();
    context.moveTo(x, y);
    context.bezierCurveTo(x + 2, y + length * 0.3, x - 2, y + length * 0.7, x + random() * 4 - 2, y + length);
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

function makeBranches(branches: Branch[], random: () => number) {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const twigBends: number[] = [];
  const twigShapes: number[] = [];
  const branchBends: number[] = [];
  const branchShapes: number[] = [];
  const windPhases: number[] = [];
  const indices: number[] = [];
  const normal = new THREE.Vector3();
  const side = new THREE.Vector3();
  const ringNormal = new THREE.Vector3();
  for (const branch of branches) {
    const length = branch.curve.getLength();
    const segments = branch.depth === 0 ? 36 : Math.max(4, Math.ceil(length * 10));
    const sides = branch.depth <= 1 ? 9 : 5;
    const frames = branch.curve.computeFrenetFrames(segments, false);
    const start = positions.length / 3;
    const indexStart = indices.length;
    const ridgePhase = random() * Math.PI * 2;
    for (let ring = 0; ring <= segments; ring++) {
      const t = ring / segments;
      const center = branch.curve.getPointAt(t);
      const twig = twigSample(branch.curve, branch.wind, branch.wind ? branch.curve.getUtoTmapping(t, t * length) : 0);
      const cluster = branchSample(center, branch.branchWind);
      side.copy(frames.binormals[ring]!);
      normal.copy(frames.normals[ring]!);
      const taper = branch.depth === 0 ? 0.2 + 0.8 * Math.pow(1 - t, 0.85) : 0.07 + 0.93 * Math.pow(1 - t, 1.03);
      const rootFlare = branch.depth === 0 ? 1 + 0.12 * Math.exp(-t * 27) : 1;
      for (let around = 0; around <= sides; around++) {
        const angle = (around / sides) * Math.PI * 2;
        ringNormal.copy(normal).multiplyScalar(Math.cos(angle)).addScaledVector(side, Math.sin(angle));
        const ridge = 1 + 0.055 * Math.sin(angle * 5 + ridgePhase + t * 5);
        const radius = branch.radius * taper * rootFlare * ridge;
        positions.push(center.x + ringNormal.x * radius, center.y + ringNormal.y * radius, center.z + ringNormal.z * radius);
        normals.push(ringNormal.x, ringNormal.y, ringNormal.z);
        twigBends.push(...twig.bend);
        twigShapes.push(...twig.shape);
        branchBends.push(...cluster.bend);
        branchShapes.push(...cluster.shape);
        windPhases.push(branch.wind?.envelopePhase ?? 0, branch.branchWind?.envelopePhase ?? 0);
        const shade = 0.81 + 0.12 * Math.cos(angle * 5 + ridgePhase) + 0.05 * Math.sin(t * 40);
        colors.push(shade, shade, shade * 0.94);
        uvs.push(around / sides, t * length * 0.62);
        if (ring < segments && around < sides) {
          const current = start + ring * (sides + 1) + around;
          indices.push(current, current + 1, current + sides + 1, current + 1, current + sides + 2, current + sides + 1);
        }
      }
    }
    branch.range = { vertexStart: start, vertexCount: positions.length / 3 - start, indexStart, indexCount: indices.length - indexStart };
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('twigBend', new THREE.Float32BufferAttribute(twigBends, 4));
  geometry.setAttribute('twigShape', new THREE.Float32BufferAttribute(twigShapes, 4));
  geometry.setAttribute('branchBend', new THREE.Float32BufferAttribute(branchBends, 4));
  geometry.setAttribute('branchShape', new THREE.Float32BufferAttribute(branchShapes, 4));
  geometry.setAttribute('windPhase', new THREE.Float32BufferAttribute(windPhases, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}

/** A narrow, gently folded leaf: its low curvature keeps the crown airy. */
function makeLeaf() {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const sections = [0, 0.16, 0.38, 0.62, 0.83, 1];
  for (let row = 0; row < sections.length; row++) {
    const y = sections[row]!;
    const width = Math.pow(Math.sin(y * Math.PI), 0.85) * 0.245;
    for (let column = 0; column < 5; column++) {
      const across = (column - 2) / 2;
      const x = width * across;
      const z = Math.sin(y * Math.PI) * (0.04 - 0.037 * Math.abs(across)) + y * y * 0.025;
      positions.push(x, y, z);
      const vein = column === 2 ? 1.07 : 0.84 + 0.12 * (1 - Math.abs(across));
      colors.push(vein, vein, vein * 0.95);
      if (row < sections.length - 1 && column < 4) {
        const index = row * 5 + column;
        indices.push(index, index + 1, index + 5, index + 1, index + 6, index + 5);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createGardenTree(stage: GardenGrowthStage = 'mature'): {
  stage: GardenGrowthStage;
  wateringTargets: WaterPoint[];
  growthModel: GrowthModel;
  growFrom: (source: { growthModel: GrowthModel }, duration?: number) => ReturnType<typeof createGrowthTransition>;
  group: THREE.Group;
  sortLeaves: (camera: THREE.Camera) => void;
  setLeafEdges: (enabled: boolean) => void;
  setLeafBlades: (enabled: boolean) => void;
  setTwigs: (enabled: boolean) => void;
  setWindTravel: (enabled: boolean) => void;
  updateMotion: (seconds: number) => void;
  setWateringTime: (seconds: number) => void;
  setWateringTargets: (targets: readonly WaterPoint[]) => void;
  createLeafStudy: () => { mesh: THREE.InstancedMesh; dispose: () => void };
  createTwigStudy: () => { group: THREE.Group; sortLeaves: (camera: THREE.Camera) => void; dispose: () => void };
  dispose: () => void;
  stats: { branches: number; leaves: number };
} {
  const growth = GARDEN_GROWTH[stage];
  const random = randomSource(72819);
  // Thinning uses its own sequence so the established branches and leaf poses stay fixed.
  const leafRetention = randomSource(51473);
  const edgeRandom = randomSource(95137);
  const bladeRandom = randomSource(63721);
  const twigRandom = randomSource(82631);
  const branchRandom = randomSource(37019);
  const group = new THREE.Group();
  group.name = 'Reference garden tree';
  const referenceTrunk = curveThrough([[0, 0, 0], [-0.045, 0.65, 0.01], [0.11, 1.35, 0.03], [0.05, 1.9, 0], [0, 2.4, -0.02], [0.12, 3.1, -0.03], [0.2, 3.7, -0.1], [0.04, 4.6, -0.18]]);
  const trunkPoint = (point: THREE.Vector3) => point.clone().multiply(new THREE.Vector3(growth.thickness, growth.trunkHeight, growth.thickness));
  const trunkCurve = stage === 'mature' ? referenceTrunk
    : new THREE.CatmullRomCurve3(referenceTrunk.points.map(trunkPoint), false, 'centripetal');
  function extendCurve(reference: THREE.CatmullRomCurve3, attachment: THREE.Vector3, extension: number) {
    if (stage === 'mature') return reference;
    return new THREE.CatmullRomCurve3(reference.points.map(point => point.clone().sub(reference.points[0]!)
      .multiplyScalar(extension).add(attachment)), false, 'centripetal');
  }
  const branches: Branch[] = [{
    curve: trunkCurve,
    referenceCurve: referenceTrunk, visible: true,
    radius: 0.145 * growth.thickness,
    depth: 0,
  }];
  const leafTransforms: THREE.Matrix4[] = [];
  const leafColors: THREE.Color[] = [];
  const edgeVariations: number[] = [];
  const bladeVariations: number[] = [];
  const twigBends: number[] = [];
  const twigShapes: number[] = [];
  const branchBends: number[] = [];
  const branchShapes: number[] = [];
  const windPhases: number[] = [];
  const leafTwigs: Array<Branch | undefined> = [];
  const leafAttachments: Array<{ id: number; owner: Branch }> = [];
  let leafId = 0;
  const dummy = new THREE.Object3D();
  const leafUp = new THREE.Vector3(0, 1, 0);
  const palette = ['#8ab078', '#80a66d', '#719c5d', '#9cbd86', '#648c55'].map((value) => new THREE.Color(value));

  function putLeaves(curve: THREE.CatmullRomCurve3, density: number, fullness: number, owner?: Branch, visible = owner?.visible ?? true, attachmentOwner = owner) {
    const tangent = new THREE.Vector3();
    const direction = new THREE.Vector3();
    const count = Math.floor((density + random() * 4) * fullness * 0.8);
    const start = 0.08 + random() * 0.22;
    const end = 0.78 + random() * 0.2;
    for (let index = 0; index < count; index++) {
      const t = start + (index / Math.max(1, count - 1)) * (end - start);
      const position = curve.getPoint(t);
      tangent.copy(curve.getTangent(t));
      // Alternating phyllotaxis: leaves are attached along twigs, not scattered in a ball.
      const angle = index * 2.39996 + random() * 0.45;
      direction.set(Math.cos(angle) * 0.85, -0.2 + random() * 0.7, Math.sin(angle) * 0.85).addScaledVector(tangent, 0.7).normalize();
      dummy.position.copy(position);
      dummy.quaternion.setFromUnitVectors(leafUp, direction);
      dummy.rotateY(random() * 1.8 - 0.9);
      const length = (0.19 + random() * 0.14) * growth.leafLength;
      dummy.scale.set(length * (0.8 + random() * 0.3), length, length);
      dummy.updateMatrix();
      const color = palette[Math.floor(random() * palette.length)]!.clone();
      // Modest interior darkening preserves readable depth under the soft skylight.
      const interior = Math.max(0, 1 - Math.abs(position.x) / 2.5) * Math.max(0, 1 - Math.abs(position.y - 3.6) / 2.5);
      color.multiplyScalar(0.94 + random() * 0.1 - interior * 0.16);
      const retain = leafRetention() > 0.43;
      // Keep the ends of each spray so the outer silhouette stays full.
      if (index === 0 || index === count - 1 || retain) {
        // Consume the canonical variation sequence even before a leaf has grown.
        const edgeVariation = [edgeRandom(), edgeRandom(), .75 + .25 * edgeRandom(), .08 + .12 * edgeRandom()];
        const bladeVariation = [bladeRandom(), .7 + .3 * bladeRandom()];
        const id = leafId++;
        if (!visible) continue;
        leafAttachments.push({ id, owner: attachmentOwner! });
        leafTransforms.push(dummy.matrix.clone());
        leafColors.push(color);
        // Motion variation never consumes the shape/color random sequence.
        edgeVariations.push(...edgeVariation);
        bladeVariations.push(...bladeVariation);
        const twig = twigSample(curve, owner?.wind, t, dummy.matrix);
        twigBends.push(...twig.bend);
        twigShapes.push(...twig.shape);
        const cluster = branchSample(position, owner?.branchWind, dummy.matrix);
        branchBends.push(...cluster.bend);
        branchShapes.push(...cluster.shape);
        // A twig and all attached leaves share one strength, so their joints never separate.
        windPhases.push(owner?.wind?.envelopePhase ?? windPhaseAt(position), owner?.branchWind?.envelopePhase ?? 0);
        leafTwigs.push(owner?.wind ? owner : undefined);
      }
    }
  }

  function grow(parent: Branch, depth: number, count: number) {
    const twigPhase = twigRandom();
    const twigAngle = twigRandom() * Math.PI * 2;
    const branchPhase = depth === 2 ? branchRandom() : 0;
    for (let index = 0; index < count; index++) {
      const t = (depth === 2 ? 0.3 : 0.12) + (index / count) * (depth === 2 ? 0.65 : 0.82) + random() * 0.035;
      const start = parent.referenceCurve.getPoint(t);
      const tangent = parent.referenceCurve.getTangent(t).normalize();
      const azimuth = index * 2.39996 + random() * 1.7;
      const side = new THREE.Vector3(Math.cos(azimuth), -0.35 + random() * 1.05, Math.sin(azimuth) * 0.8);
      const direction = tangent.clone().multiplyScalar(depth === 2 ? 0.8 : 0.65).add(side).normalize();
      const length = depth === 2 ? 0.65 + random() * 0.5 : depth === 3 ? 0.34 + random() * 0.37 : 0.22 + random() * 0.26;
      const droop = parent.droop ?? 0;
      direction.y -= droop * (depth === 2 ? 0.4 : 0.8);
      if (start.y < 1.45) direction.y = Math.max(direction.y, 0.15);
      direction.normalize();
      const end = start.clone().addScaledVector(direction, length);
      const bend = new THREE.Vector3(random() * 0.16 - 0.08, random() * 0.12 - droop * 0.1, random() * 0.14 - 0.07);
      const referenceCurve = new THREE.CatmullRomCurve3([
        start,
        start.clone().addScaledVector(tangent, length * 0.27).addScaledVector(direction, length * 0.13),
        start.clone().lerp(end, 0.7).add(bend),
        end,
      ], false, 'centripetal');
      const curve = extendCurve(referenceCurve, parent.curve.getPoint(t), growth.shootExtension);
      const foliage = (parent.foliage ?? 1) * (depth === 2 ? 0.65 + random() * 0.7 : 1);
      const branch: Branch = {
        curve, radius: parent.radius * (depth === 2 ? 0.29 : 0.44) * (1 - t * 0.55), depth, foliage, droop,
        referenceCurve, parent, visible: parent.visible && (!growth.shoots || growth.shoots[depth]!.includes(index)),
        // One small branch carries its full leaf cluster, including descendant twigs.
        branchWind: depth === 2 ? createBranchWind(curve,
          branchPhase + index * .5 + (branchRandom() - .5) * .06, .85 + .15 * branchRandom()) : parent.branchWind,
      };
      // Only terminal twigs bend. Siblings alternate phase around the same local direction.
      if (depth === 4) branch.wind = createTwigWind(curve,
        twigPhase + index * .5 + (twigRandom() - .5) * .08,
        twigAngle + (twigRandom() - .5) * .24, .75 + .25 * twigRandom());
      branches.push(branch);
      if (depth < 4) grow(branch, depth + 1, depth === 2 ? 5 : 3);
      // Some shoots stay bare, and neighbouring sprays have different leaf densities.
      if (depth >= 3 && random() > (depth === 3 ? 0.16 : 0.09)) putLeaves(curve, depth === 3 ? 5 : 8, foliage, branch);
    }
  }

  for (const [mainIndex, main] of MAIN_BRANCHES.entries()) {
    const referenceCurve = curveThrough(main.points);
    const curve = extendCurve(referenceCurve, trunkPoint(referenceCurve.points[0]!), growth.mainExtension);
    const branch: Branch = {
      curve, radius: main.radius * growth.thickness, depth: 1, foliage: main.foliage, droop: main.droop,
      referenceCurve, parent: branches[0], visible: !growth.mainBranches || growth.mainBranches.includes(mainIndex),
    };
    branches.push(branch);
    grow(branch, 2, 8);
    putLeaves(new THREE.CatmullRomCurve3([branch.curve.getPoint(0.8), branch.curve.getPoint(0.9), branch.curve.getPoint(1)]), 6, main.foliage, undefined, branch.visible, branch);
    // Unbranched trailing tips break the rounded edge of each leafy spray.
    const tipPhase = twigRandom();
    const tipAngle = twigRandom() * Math.PI * 2;
    for (let tip = 0; tip < 2; tip++) {
      const start = referenceCurve.getPoint(0.7 + tip * 0.18);
      const direction = referenceCurve.getTangent(0.8).normalize();
      const length = 0.55 + random() * 0.4;
      const end = start.clone().addScaledVector(direction, length);
      end.y -= main.droop + 0.12 + random() * 0.18;
      // Tuck the lower-right tips into their leaf clusters instead of leaving long hanging threads.
      const tipScale = main.tipScale ?? 1;
      end.lerp(start, 1 - tipScale);
      const referenceTip = new THREE.CatmullRomCurve3([start, start.clone().lerp(end, 0.55).add(new THREE.Vector3(0, 0.12 * tipScale, 0)), end]);
      const tipCurve = extendCurve(referenceTip, branch.curve.getPoint(0.7 + tip * 0.18), growth.shootExtension);
      const trailing: Branch = { curve: tipCurve, radius: 0.007 * growth.thickness, depth: 4,
        referenceCurve: referenceTip, parent: branch, visible: branch.visible && tip < growth.trailingTips,
        wind: createTwigWind(tipCurve, tipPhase + tip * .5, tipAngle, .85) };
      branches.push(trailing);
      if (tip === 0) putLeaves(tipCurve, 3, main.foliage, trailing);
    }
  }

  const bark = makeBark(randomSource(983));
  const barkMaterial = new THREE.MeshStandardMaterial({ map: bark, bumpMap: bark, bumpScale: .008, color: bark ? '#ddd9c9' : '#777367', vertexColors: true, roughness: 1, emissive: '#716d5e', emissiveIntensity: .3 });
  const leafMaterial = new THREE.MeshPhysicalMaterial({
    color: '#ffffff', vertexColors: true, metalness: 0,
    roughness: 0.26, clearcoat: 0.8, clearcoatRoughness: 0.22,
    transparent: true, opacity: 0.74, depthWrite: false,
    side: THREE.DoubleSide, forceSinglePass: true,
    emissive: '#728854', emissiveIntensity: 0.12,
  });
  const visibleBranches = branches.filter(branch => branch.visible);
  const wood = new THREE.Mesh(makeBranches(visibleBranches, random), barkMaterial);
  wood.name = 'Connected trunk and branch structure';
  wood.castShadow = true;
  wood.receiveShadow = true;
  const leaves = new THREE.InstancedMesh(makeLeaf(), leafMaterial, leafTransforms.length);
  leaves.geometry.setAttribute('leafEdgeVariation', new THREE.InstancedBufferAttribute(new Float32Array(edgeVariations), 4));
  leaves.geometry.setAttribute('leafBladeVariation', new THREE.InstancedBufferAttribute(new Float32Array(bladeVariations), 2));
  leaves.geometry.setAttribute('twigBend', new THREE.InstancedBufferAttribute(new Float32Array(twigBends), 4));
  leaves.geometry.setAttribute('twigShape', new THREE.InstancedBufferAttribute(new Float32Array(twigShapes), 4));
  leaves.geometry.setAttribute('branchBend', new THREE.InstancedBufferAttribute(new Float32Array(branchBends), 4));
  leaves.geometry.setAttribute('branchShape', new THREE.InstancedBufferAttribute(new Float32Array(branchShapes), 4));
  leaves.geometry.setAttribute('windPhase', new THREE.InstancedBufferAttribute(new Float32Array(windPhases), 2));
  const windTime = { value: 0 };
  const windTravel = { value: 1 };
  const waterTargets = wateringTargets(leafTransforms.map(matrix => {
    const point = new THREE.Vector3(0, .6, 0).applyMatrix4(matrix);
    return [point.x, point.y, point.z];
  }));
  const leafMotion = createLeafMotion(windTime, windTravel, waterTargets);
  const twigMotion = createTwigMotion(windTime, windTravel);
  const leafDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  const woodDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  leafMotion.apply(leafMaterial);
  leafMotion.apply(leafDepthMaterial);
  for (const material of [barkMaterial, woodDepthMaterial, leafMaterial, leafDepthMaterial]) twigMotion.apply(material);
  wood.customDepthMaterial = woodDepthMaterial;
  leaves.customDepthMaterial = leafDepthMaterial;
  leaves.name = 'Individual pointed leaves';
  for (let index = 0; index < leafTransforms.length; index++) {
    leaves.setMatrixAt(index, leafTransforms[index]!);
    leaves.setColorAt(index, leafColors[index]!);
  }
  leaves.instanceMatrix.needsUpdate = true;
  if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
  leaves.computeBoundingSphere();
  leaves.computeBoundingBox();
  leaves.castShadow = true;
  leaves.receiveShadow = true;
  group.add(wood, leaves);
  const motionAttributes = ['leafEdgeVariation', 'leafBladeVariation', 'twigBend', 'twigShape', 'branchBend', 'branchShape', 'windPhase'];
  // Capture the canonical arrays before view-dependent sorting ever reorders them.
  const originalMotion = motionAttributes.map(name => leaves.geometry.getAttribute(name).array.slice());
  const sorter = createLeafSorter(leaves, motionAttributes);
  const branchIds = new Map(branches.map((branch, id) => [branch, id]));
  const growthModel: GrowthModel = {
    wood, leaves, sorter,
    branches: branches.map(branch => ({
      parent: branch.parent ? branchIds.get(branch.parent)! : -1,
      origin: branch.curve.getPoint(0), visible: branch.visible, depth: branch.depth, range: branch.range,
    })),
    attachments: leafAttachments.map(({ id, owner }) => ({ id, branch: branchIds.get(owner)! })),
    leafMatrices: new Float32Array(leafTransforms.flatMap(matrix => matrix.elements)),
    leafColors: new Float32Array(leafColors.flatMap(color => color.toArray())),
    leafMotion: Object.fromEntries(motionAttributes.map((name, index) => [name, originalMotion[index]!])),
  };

  return {
    stage,
    wateringTargets: waterTargets,
    group,
    growthModel,
    growFrom: (source, duration) => createGrowthTransition(source.growthModel, growthModel, duration),
    sortLeaves: sorter,
    setLeafEdges: leafMotion.setEdgesEnabled,
    setLeafBlades: leafMotion.setBladesEnabled,
    setTwigs: twigMotion.setEnabled,
    setWindTravel: enabled => { windTravel.value = enabled ? 1 : 0; },
    updateMotion: leafMotion.setTime,
    setWateringTime: leafMotion.setWateringTime,
    setWateringTargets: leafMotion.setWateringTargets,
    createLeafStudy: () => {
      const geometry = leaves.geometry.clone();
      geometry.setAttribute('leafEdgeVariation', new THREE.InstancedBufferAttribute(new Float32Array(edgeVariations.slice(0, 4)), 4));
      geometry.setAttribute('leafBladeVariation', new THREE.InstancedBufferAttribute(new Float32Array(bladeVariations.slice(0, 2)), 2));
      geometry.setAttribute('windPhase', new THREE.InstancedBufferAttribute(new Float32Array(windPhases.slice(0, 2)), 2));
      // Isolated leaf inspection has no parent twig and must not inherit its motion.
      geometry.setAttribute('twigBend', new THREE.InstancedBufferAttribute(new Float32Array(4), 4));
      geometry.setAttribute('twigShape', new THREE.InstancedBufferAttribute(new Float32Array(4), 4));
      geometry.setAttribute('branchBend', new THREE.InstancedBufferAttribute(new Float32Array(4), 4));
      geometry.setAttribute('branchShape', new THREE.InstancedBufferAttribute(new Float32Array(4), 4));
      const mesh = new THREE.InstancedMesh(geometry, leafMaterial, 1);
      // A slight oblique angle reveals leaf flex without amplifying the deformation.
      mesh.setMatrixAt(0, new THREE.Matrix4().makeRotationY(.7));
      mesh.setColorAt(0, leafColors[0]!);
      mesh.customDepthMaterial = leafDepthMaterial;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      return { mesh, dispose: () => { mesh.removeFromParent(); geometry.dispose(); mesh.dispose(); } };
    },
    createTwigStudy: () => {
      const counts = new Map<Branch, number>();
      for (const owner of leafTwigs) if (owner) counts.set(owner, (counts.get(owner) ?? 0) + 1);
      // Prefer the established lower-left twig; younger stages use an available leafy twig.
      const candidates = visibleBranches.filter(branch => branch.wind && (counts.get(branch) ?? 0) > 0);
      const preferred = candidates.filter(branch => (counts.get(branch) ?? 0) >= 3
        && branch.curve.getPoint(0).y < 3 && branch.curve.getPoint(0).x < -1);
      const twig = (preferred.length ? preferred : candidates).sort((a, b) => b.wind!.length - a.wind!.length)[0]!;
      const range = twig.range!;
      const geometry = new THREE.BufferGeometry();
      for (const [name, attribute] of Object.entries(wood.geometry.attributes)) {
        const width = attribute.itemSize;
        geometry.setAttribute(name, new THREE.BufferAttribute(attribute.array.slice(range.vertexStart * width,
          (range.vertexStart + range.vertexCount) * width), width));
      }
      geometry.setIndex(Array.from(wood.geometry.index!.array.slice(range.indexStart, range.indexStart + range.indexCount),
        index => index - range.vertexStart));
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      const branchMesh = new THREE.Mesh(geometry, barkMaterial);
      branchMesh.customDepthMaterial = woodDepthMaterial;
      const ids = leafTwigs.flatMap((owner, index) => owner === twig ? [index] : []);
      const leafGeometry = leaves.geometry.clone();
      motionAttributes.forEach((name, i) => {
        const width = leaves.geometry.getAttribute(name).itemSize;
        const data = ids.flatMap(id => Array.from(originalMotion[i]!.slice(id * width, (id + 1) * width)));
        leafGeometry.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(data), width));
      });
      const leafMesh = new THREE.InstancedMesh(leafGeometry, leafMaterial, ids.length);
      leafMesh.customDepthMaterial = leafDepthMaterial;
      ids.forEach((id, slot) => {
        leafMesh.setMatrixAt(slot, leafTransforms[id]!);
        leafMesh.setColorAt(slot, leafColors[id]!);
      });
      leafMesh.computeBoundingSphere();
      leafMesh.computeBoundingBox();
      for (const mesh of [branchMesh, leafMesh]) { mesh.castShadow = true; mesh.receiveShadow = true; }
      const study = new THREE.Group();
      study.add(branchMesh, leafMesh);
      return { group: study, sortLeaves: createLeafSorter(leafMesh, motionAttributes), dispose: () => {
        study.removeFromParent(); geometry.dispose(); leafGeometry.dispose(); leafMesh.dispose(); study.clear();
      } };
    },
    dispose: () => {
      wood.geometry.dispose();
      leaves.geometry.dispose();
      leaves.dispose();
      barkMaterial.dispose();
      leafMaterial.dispose();
      leafDepthMaterial.dispose();
      woodDepthMaterial.dispose();
      bark?.dispose();
      group.clear();
    },
    stats: { branches: visibleBranches.length, leaves: leafTransforms.length },
  };
}
