import * as THREE from 'three';

/** Reorder transparent instances only when the camera-to-tree transform changes. */
export function createLeafSorter(
  leaves: THREE.InstancedMesh,
  associatedAttributes: readonly string[] = [],
): ((camera: THREE.Camera) => void) & { refresh: () => void } {
  const count = leaves.count;
  const attributes: THREE.BufferAttribute[] = [leaves.instanceMatrix];
  if (leaves.instanceColor) attributes.push(leaves.instanceColor);
  for (const name of new Set(associatedAttributes)) {
    const attribute = leaves.geometry.getAttribute(name);
    if (!(attribute instanceof THREE.InstancedBufferAttribute) || attribute.meshPerAttribute !== 1 || attribute.count < count) {
      throw new Error(`Leaf sorting requires a per-instance attribute with ${count} entries: ${name}`);
    }
    attributes.push(attribute);
  }
  // Canonical data never changes: returning to a view must not accumulate permutations.
  const originals = attributes.map((attribute) => attribute.array.slice());
  const originalMatrices = originals[0]!;
  const centers = new Float64Array(count * 3);
  const center = new THREE.Vector3();
  const point = new THREE.Vector3();
  const instance = new THREE.Matrix4();
  if (!leaves.geometry.boundingBox) leaves.geometry.computeBoundingBox();
  leaves.geometry.boundingBox?.getCenter(center);
  function updateCenters() {
    for (let index = 0; index < count; index++) {
      instance.fromArray(originalMatrices, index * 16);
      point.copy(center).applyMatrix4(instance).toArray(centers, index * 3);
    }
  }
  updateCenters();

  const relativeView = new THREE.Matrix4();
  const previousView = new THREE.Matrix4();
  let hasPreviousView = false;
  const depths = new Float64Array(count);
  const order = Array.from({ length: count }, (_, index) => index);
  const previousOrder = order.slice();

  const sort = (camera: THREE.Camera) => {
    camera.updateWorldMatrix(true, false);
    leaves.updateWorldMatrix(true, false);
    relativeView.multiplyMatrices(camera.matrixWorldInverse, leaves.matrixWorld);
    if (hasPreviousView && relativeView.equals(previousView)) return;
    previousView.copy(relativeView);
    hasPreviousView = true;

    const view = relativeView.elements;
    for (let index = 0; index < count; index++) {
      const offset = index * 3;
      depths[index] = view[2]! * centers[offset]! + view[6]! * centers[offset + 1]! + view[10]! * centers[offset + 2]! + view[14]!;
    }
    // More negative view-space Z is farther away. Original indices break equal-depth ties.
    order.sort((a, b) => depths[a]! - depths[b]! || a - b);
    if (order.every((index, slot) => index === previousOrder[slot])) return;

    for (let index = 0; index < attributes.length; index++) {
      const attribute = attributes[index]!;
      const original = originals[index]!;
      const width = attribute.itemSize;
      for (let slot = 0; slot < count; slot++) {
        const source = order[slot]! * width;
        const destination = slot * width;
        for (let component = 0; component < width; component++) {
          attribute.array[destination + component] = original[source + component]!;
        }
      }
      attribute.needsUpdate = true;
    }
    for (let slot = 0; slot < count; slot++) previousOrder[slot] = order[slot]!;
  };
  // Growth writes every instance attribute in canonical order before refreshing.
  // Static trees keep the original view-only fast path.
  return Object.assign(sort, { refresh() {
    attributes.forEach((attribute, index) => originals[index]!.set(attribute.array));
    updateCenters();
    hasPreviousView = false;
    for (let slot = 0; slot < count; slot++) previousOrder[slot] = slot;
  } });
}
