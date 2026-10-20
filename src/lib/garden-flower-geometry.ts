import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type FlowerKind = 'pink' | 'blue' | 'ivory';

/** Shape, tint and opening vary per flower; plants and wind are assembled separately. */
export function createFlowerHead(kind: FlowerKind, radius: number, bud: boolean, random: () => number) {
  const openness = bud ? .16 : .62 + random() * .38;
  const violet = kind === 'blue' && random() < .45;
  const inner = new THREE.Color(kind === 'pink' ? '#c95782' : kind === 'ivory' ? '#a6b185'
    : violet ? '#8660b1' : '#4e87b4');
  const outer = new THREE.Color(kind === 'pink' ? '#f1b4cb' : kind === 'ivory' ? '#f7efd9'
    : violet ? '#baa4da' : '#9dc9e0');
  const layers = kind === 'pink' ? (bud ? [5, 4] : openness > .8 ? [7, 5] : [7, 5, 4])
    : kind === 'ivory' ? (bud ? [7] : [9, 5]) : [5];
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const color = new THREE.Color();
  const rows = 10, cols = 6;
  layers.forEach((count, layer) => {
    for (let petal = 0; petal < count; petal++) {
      const angle = petal / count * Math.PI * 2 + layer * .53 + (random() - .5) * .12;
      const size = radius * (1 - layer * .25) * (.88 + random() * .24);
      const breadth = .86 + random() * .25;
      const bend = .8 + random() * .4;
      const ripple = random() * Math.PI * 2;
      const curled = kind === 'ivory' && petal % 3 === 0;
      const offset = positions.length / 3;
      for (let row = 0; row <= rows; row++) {
        const t = row / rows;
        const sin = Math.max(0, Math.sin(Math.PI * t));
        const reach = size * (.12 + (.72 + openness * .16) * t - (curled ? .13 * t ** 5 : 0));
        const radial = reach * (bud ? .55 : 1);
        const width = Math.min(
          size * (kind === 'blue' ? .72 : kind === 'ivory' ? .23 : .37) * breadth * sin ** .55,
          // Keep five distinct lobes with small gaps, including near their bases.
          kind === 'blue' ? reach * .55 : Infinity,
        );
        for (let col = 0; col <= cols; col++) {
          const across = col / cols * 2 - 1;
          const cup = bud ? .95 * t * t
            : kind === 'ivory' ? .08 * sin + (curled ? .38 : .06) * t ** 5
            : (.14 + (1 - openness) * .3 + layer * .08) * t * t;
          const edgeFold = .055 * across * across * sin;
          const softRipple = .025 * Math.sin(t * Math.PI * 2 + ripple) * across * sin;
          const tangent = width * across + size * .035 * Math.sin(t * Math.PI + ripple) * t;
          positions.push(Math.cos(angle) * radial - Math.sin(angle) * tangent,
            size * (cup * bend + edgeFold + softRipple) + layer * radius * .035,
            Math.sin(angle) * radial + Math.cos(angle) * tangent);
          // Saturated throat, pale tips, and only a narrow translucent rim.
          const rim = Math.max(THREE.MathUtils.smoothstep(t, .72, 1),
            THREE.MathUtils.smoothstep(Math.abs(across), .62, 1));
          const tint = Math.min(1, .1 + .84 * t ** .8 + rim * .06);
          color.copy(inner).lerp(outer, tint * (kind === 'pink' ? 1 - layer * .19 : 1));
          colors.push(color.r, color.g, color.b, .99 - rim * .14 * (bud ? .45 : 1));
          if (row < rows && col < cols) {
            const a = offset + row * (cols + 1) + col, b = a + cols + 1;
            indices.push(a, b, a + 1, a + 1, b, b + 1);
          }
        }
      }
    }
  });
  const petals = new THREE.BufferGeometry();
  petals.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  petals.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  petals.setIndex(indices);
  petals.computeVertexNormals();
  return { petals, center: bud ? null : createFlowerCenter(kind, radius) };
}

function createFlowerCenter(kind: FlowerKind, radius: number) {
  const centerRadius = radius * (kind === 'pink' ? .19 : kind === 'blue' ? .2 : .18);
  const tint = new THREE.Color(kind === 'ivory' ? '#b6be79' : kind === 'pink' ? '#e4b655' : '#efd38b');
  const center = new THREE.SphereGeometry(centerRadius, 10, 6);
  center.scale(1, .4, 1);
  center.translate(0, radius * .075, 0);
  const parts: THREE.BufferGeometry[] = [center];
  // A few tiny pollen bumps break up the perfect sphere without extra draw calls.
  for (let i = 0; i < 6; i++) {
    const angle = i / 6 * Math.PI * 2;
    const pollen = new THREE.SphereGeometry(centerRadius * .2, 5, 3);
    pollen.translate(Math.cos(angle) * centerRadius * .62, radius * .075 + centerRadius * .34,
      Math.sin(angle) * centerRadius * .62);
    parts.push(pollen);
  }
  const geometry = mergeGeometries(parts);
  parts.forEach(part => part.dispose());
  if (!geometry) throw new Error('Cannot assemble flower center');
  const color: number[] = [];
  for (let i = 0; i < geometry.getAttribute('position').count; i++) color.push(tint.r, tint.g, tint.b);
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
  return geometry;
}
