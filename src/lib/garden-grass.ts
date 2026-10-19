import * as THREE from 'three';

// Independent of tree growth: a quiet, fixed patch around all three stages.
export const GRASS = { radiusX: 3.7, radiusZ: 1.65, clumps: 420, blades: 12, segments: 5,
  tipBend: .065, localBend: .018, period: 8 } as const;

function randomSource() {
  let seed = 9187;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function edge(angle: number) { return 1 + .065 * Math.sin(angle * 3 + .5) + .04 * Math.cos(angle * 5); }
function groundHeight(x: number, z: number) {
  const radius = Math.hypot(x / GRASS.radiusX, z / GRASS.radiusZ);
  return -.018 + .11 * Math.max(0, 1 - radius * radius) *
    (1 + .3 * Math.sin(x * 1.7) * Math.cos(z * 2)) * Math.min(1, Math.hypot(x, z) * 3);
}

const grassWindHeader = `
uniform float grassTime;
uniform float grassMotion;
attribute vec3 grassBend;
float grassWave(float phase) {
  return ${GRASS.tipBend} * sin(6.28318530718 * grassTime / ${GRASS.period}.0 - phase)
    + ${GRASS.localBend} * sin(6.28318530718 * grassTime * 3.0 / ${GRASS.period}.0 + phase * 2.7);
}
`;

/** One merged grass mesh; only a shared time uniform changes each frame. */
export function createGardenGrass() {
  const group = new THREE.Group();
  group.name = 'garden-meadow';
  const random = randomSource();
  const positions: number[] = [], colors: number[] = [], bends: number[] = [], indices: number[] = [];
  const rootColor = new THREE.Color('#637a56');
  const tipColors = ['#aabb87', '#b9c89b', '#96ad7e', '#c2cda2'].map(color => new THREE.Color(color));
  const color = new THREE.Color();
  for (let clump = 0; clump < GRASS.clumps; clump++) {
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(random()) * edge(angle);
    const cx = Math.cos(angle) * radius * GRASS.radiusX;
    const cz = Math.sin(angle) * radius * GRASS.radiusZ;
    // Keep the trunk foot legible, with a sparse, irregular fringe outside.
    if (Math.hypot(cx, cz) < .24) continue;
    const fringe = THREE.MathUtils.smoothstep(radius, .7, 1.1);
    const count = Math.round(GRASS.blades * (1 - fringe * .7));
    const height = (.22 + random() * .26) * (1 - fringe * .3);
    const tipColor = tipColors[Math.floor(random() * tipColors.length)]!;
    const phase = cx * .8 + cz * .7 + random() * .65;
    for (let blade = 0; blade < count; blade++) {
      const spread = random() * .15;
      const direction = random() * Math.PI * 2;
      const x = cx + Math.cos(direction) * spread, z = cz + Math.sin(direction) * spread;
      const y = groundHeight(x, z);
      const length = height * (.6 + random() * .65);
      const width = .012 + random() * .013;
      const lean = length * (.12 + random() * .3);
      const offset = positions.length / 3;
      for (let segment = 0; segment <= GRASS.segments; segment++) {
        const t = segment / GRASS.segments;
        const halfWidth = width * (1 - t) * (.7 + .6 * Math.sin(t * Math.PI));
        color.copy(rootColor).lerp(tipColor, .16 + .84 * t);
        for (const side of [-1, 1]) {
          positions.push(x + Math.cos(direction) * lean * t * t + Math.sin(direction) * halfWidth * side,
            y + length * t - lean * .18 * t * t,
            z + Math.sin(direction) * lean * t * t - Math.cos(direction) * halfWidth * side);
          colors.push(color.r, color.g, color.b);
          bends.push(t * t, phase, length / .4);
        }
        if (segment < GRASS.segments) {
          const a = offset + segment * 2;
          indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('grassBend', new THREE.Float32BufferAttribute(bends, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.boundingSphere!.radius += .15;
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide,
    roughness: .85, emissive: '#89996e', emissiveIntensity: .18 });
  const time = { value: 0 }, enabled = { value: 1 };
  material.onBeforeCompile = shader => {
    shader.uniforms.grassTime = time;
    shader.uniforms.grassMotion = enabled;
    shader.vertexShader = grassWindHeader + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', `
      #include <beginnormal_vertex>
      float slope = grassMotion * grassWave(grassBend.y) * 2.0 * sqrt(grassBend.x) / 0.4;
      objectNormal.y -= slope * (objectNormal.x + objectNormal.z * 0.22);
      objectNormal = normalize(objectNormal);
    `);
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      float bend = grassMotion * grassWave(grassBend.y) * grassBend.x * grassBend.z;
      transformed.x += bend;
      transformed.z += bend * 0.22;
    `);
  };
  material.customProgramCacheKey = () => 'garden-grass-v1';
  const grass = new THREE.Mesh(geometry, material);
  grass.name = 'grass-blades';
  // Receiving the tree's shadow anchors the grass without a second grass shadow pass.
  grass.receiveShadow = true;
  group.add(grass);

  const soilPositions: number[] = [], soilColors: number[] = [], soilIndices: number[] = [];
  const rings = 12, sides = 96;
  const soilColor = new THREE.Color('#a5b29a');
  for (let ring = 0; ring <= rings; ring++) {
    const r = ring / rings;
    for (let side = 0; side <= sides; side++) {
      const angle = side / sides * Math.PI * 2;
      const x = Math.cos(angle) * r * edge(angle) * GRASS.radiusX;
      const z = Math.sin(angle) * r * edge(angle) * GRASS.radiusZ;
      soilPositions.push(x, groundHeight(x, z) - .006, z);
      soilColors.push(soilColor.r, soilColor.g, soilColor.b, .55 * (1 - THREE.MathUtils.smoothstep(r, .65, 1)));
      if (ring < rings && side < sides) {
        const a = ring * (sides + 1) + side, b = a + sides + 1;
        soilIndices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  const soilGeometry = new THREE.BufferGeometry();
  soilGeometry.setAttribute('position', new THREE.Float32BufferAttribute(soilPositions, 3));
  soilGeometry.setAttribute('color', new THREE.Float32BufferAttribute(soilColors, 4));
  soilGeometry.setIndex(soilIndices);
  soilGeometry.computeVertexNormals();
  const soilMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true,
    depthWrite: false, roughness: 1, side: THREE.DoubleSide });
  const soil = new THREE.Mesh(soilGeometry, soilMaterial);
  soil.name = 'meadow-ground';
  soil.receiveShadow = true;
  group.add(soil);
  return {
    group,
    update(seconds: number) { time.value = seconds; },
    setMotion(active: boolean) { enabled.value = active ? 1 : 0; },
    dispose() {
      group.removeFromParent();
      geometry.dispose(); material.dispose(); soilGeometry.dispose(); soilMaterial.dispose();
      group.clear();
    },
  };
}
