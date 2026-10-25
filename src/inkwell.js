import * as THREE from 'three';

/** Squat glazed stoneware inkwell standing on the page; its axis points at the camera (+Z). */
export function createInkwell() {
  const outer = [
    [0.0, 0.0], [0.5, 0.0], [0.57, 0.03], [0.62, 0.12], [0.615, 0.24], [0.56, 0.36],
    [0.44, 0.46], [0.3, 0.53], [0.215, 0.565], [0.205, 0.63], [0.24, 0.65], [0.245, 0.69],
    [0.225, 0.71], [0.175, 0.705], [0.165, 0.66], [0.16, 0.5], [0.0, 0.5],
  ].map(([r, h]) => new THREE.Vector2(r, h));
  const body = new THREE.LatheGeometry(outer, 72);
  body.rotateX(Math.PI / 2);

  const group = new THREE.Group();
  const glaze = new THREE.MeshPhysicalMaterial({
    color: 0x5a1f15, roughness: 0.3, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.18,
  });
  const bodyMesh = new THREE.Mesh(body, glaze);
  bodyMesh.castShadow = true;

  const ink = new THREE.Mesh(
    new THREE.CircleGeometry(0.162, 48),
    new THREE.MeshPhysicalMaterial({ color: 0x0b0d14, roughness: 0.04, clearcoat: 1, metalness: 0.2 })
  );
  ink.position.z = 0.6;

  group.add(bodyMesh, ink);
  return { group, glaze, inkSurface: ink };
}
