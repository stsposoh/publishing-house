import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const CAM_Z = 10;
const FOV = 30;

export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 400);
  camera.position.set(0, 0, CAM_Z);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.3;

  // Warm window light from the upper left, like a desk by a north window.
  const sun = new THREE.DirectionalLight(0xfff1dc, 0.95);
  sun.position.set(-3.5, 5, 9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 7;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  const sc = sun.shadow.camera;
  sc.left = -9; sc.right = 9; sc.top = 6; sc.bottom = -6; sc.near = 1; sc.far = 30;
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight(0xfff6e8, 0x8a7a66, 0.42));

  // Transparent receiver so 3D objects drop soft shadows onto the paper.
  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 40),
    new THREE.ShadowMaterial({ color: 0x2a1c10, opacity: 0.22, depthWrite: false })
  );
  shadowPlane.position.z = -0.02;
  shadowPlane.receiveShadow = true;
  shadowPlane.renderOrder = -5;
  scene.add(shadowPlane);

  const view = { w: 1, h: 1, visW: 1, visH: 1, dpr: renderer.getPixelRatio() };

  function resize() {
    view.w = window.innerWidth;
    view.h = window.innerHeight;
    renderer.setSize(view.w, view.h, false);
    camera.aspect = view.w / view.h;
    camera.updateProjectionMatrix();
    view.visH = 2 * CAM_Z * Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    view.visW = view.visH * camera.aspect;
    view.dpr = renderer.getPixelRatio();
  }
  resize();

  /** CSS px (from top-left) → world point on the z = 0 plane. */
  const pxToWorld = (x, y, out = new THREE.Vector3()) =>
    out.set((x / view.w - 0.5) * view.visW, (0.5 - y / view.h) * view.visH, 0);

  /** CSS px length → world length on the z = 0 plane. */
  const pxLen = (l) => (l / view.h) * view.visH;

  const _v = new THREE.Vector3();
  /** World point → CSS px. */
  const worldToPx = (p) => {
    _v.copy(p).project(camera);
    return { x: (_v.x * 0.5 + 0.5) * view.w, y: (0.5 - _v.y * 0.5) * view.h };
  };

  return { renderer, scene, camera, sun, shadowPlane, view, resize, pxToWorld, pxLen, worldToPx };
}
