import * as THREE from 'three';
import { rng, clamp } from './util.js';

/*
 * A barred flight feather cut into a writing quill.
 * Local frame: +X runs from the nib (origin) to the feather tip; +Y across the vane; +Z off the vane.
 */

export const QUILL = { L: 2.7, xv0: 0.62, wide: 0.22, narrow: 0.135 };

const bendY = (x) => 0.07 * (x / QUILL.L) ** 2;
const bendZ = (x) => 0.05 * Math.sin((Math.PI * x) / QUILL.L);

function halfWidth(side, xn) {
  const f = Math.sin(Math.PI * clamp(xn) ** 0.6) ** 0.72;
  return (side > 0 ? QUILL.wide : QUILL.narrow) * f;
}

function featherTexture() {
  const W = 4096, H = 1024;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const R = rng(7);
  const { L, xv0, wide } = QUILL;
  const span = L - xv0;
  const ymax = wide * 1.12;
  const toPx = (xn, y) => [xn * W, H / 2 - (y / ymax) * (H / 2)];

  const barColor = (xn, yn) => {
    // chevron bars, darker tip, pale base
    const chev = xn * 8.2 + Math.abs(yn) * 1.4;
    const bar = clamp((Math.sin(chev * Math.PI * 2) - 0.25) * 1.6);
    const tip = clamp((xn - 0.8) / 0.2) ** 1.4;
    const base = clamp(1 - xn / 0.16);
    let r = 236, g = 226, b = 205;
    const k = clamp(bar * (0.55 + xn * 0.5) * (1 - base) + tip * 0.75);
    r += (94 - r) * k; g += (70 - g) * k; b += (46 - b) * k;
    return [r, g, b];
  };

  // an under-layer of vane so the barbs read as a surface, not a sieve
  for (const side of [1, -1]) {
    ctx.beginPath();
    ctx.moveTo(...toPx(0.1, 0));
    for (let i = 0; i <= 200; i++) {
      const xn = 0.1 + (i / 200) * 0.9;
      ctx.lineTo(...toPx(xn, side * halfWidth(side, xn) * 0.8));
    }
    ctx.lineTo(...toPx(1, 0));
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, 'rgba(214,202,178,0.42)');
    grad.addColorStop(0.75, 'rgba(176,156,128,0.42)');
    grad.addColorStop(1, 'rgba(96,72,50,0.45)');
    ctx.fillStyle = grad;
    ctx.fill();
  }
  ctx.lineCap = 'round';
  for (const side of [1, -1]) {
    const N = side > 0 ? 1900 : 1700;
    let clump = 0, clumpLeft = 0;
    for (let i = 0; i < N; i++) {
      const xn0 = (i / N) ** 1.02;
      if (clumpLeft <= 0 && R() < 0.028 && xn0 > 0.12) { clump = (R() * 0.22 + 0.06) * (R() < 0.5 ? 1 : -1); clumpLeft = 4 + R() * 12; }
      clumpLeft--;
      const off = clumpLeft > 0 ? clump : 0;
      const downy = xn0 < 0.14;
      // barbs sweep toward the tip, more acutely near it
      const phi = (0.78 - xn0 * 0.38 + (R() - 0.5) * 0.05 + off) * (downy ? 1.25 : 1);
      const cosp = Math.cos(phi), sinp = Math.sin(phi);
      const x0 = xv0 + xn0 * span;
      // march outward to the outline
      let t = 0, x = x0, y = 0;
      const step = 0.004;
      const pts = [[xn0, 0]];
      const jitter = 1 + (R() - 0.5) * 0.06;
      while (t < 0.5) {
        t += step;
        const curl = t * t * 1.1; // barbs bend toward the tip
        x = x0 + t * cosp + curl * 0.6;
        y = side * (t * sinp - curl * 0.25);
        const xn = (x - xv0) / span;
        const lim = halfWidth(side, xn) * jitter * (downy ? 1.15 : 1);
        if (Math.abs(y) >= lim || xn > 1) break;
        if (pts.length < 40 && (t / step) % 6 < 1) pts.push([xn, y]);
      }
      pts.push([(x - xv0) / span, y]);
      const alpha = downy ? 0.35 + xn0 * 3 : 0.9;
      ctx.lineWidth = downy ? 1.2 : 1.6 + R() * 0.9;
      for (let k = 1; k < pts.length; k++) {
        const [xa, ya] = pts[k - 1], [xb, yb] = pts[k];
        const [r, g, b] = barColor((xa + xb) / 2, ((ya + yb) / 2) / wide);
        const shade = 0.9 + R() * 0.18 - (k / pts.length) * 0.08;
        ctx.strokeStyle = `rgba(${r * shade | 0},${g * shade | 0},${b * shade | 0},${alpha})`;
        ctx.beginPath();
        const [pxa, pya] = toPx(xa, ya), [pxb, pyb] = toPx(xb, yb);
        const wob = downy ? (R() - 0.5) * 10 : 0;
        ctx.moveTo(pxa, pya);
        ctx.quadraticCurveTo((pxa + pxb) / 2 + wob, (pya + pyb) / 2 + wob, pxb, pyb);
        ctx.stroke();
      }
    }
  }
  // rachis
  for (let i = 0; i < 400; i++) {
    const a = i / 400, b = (i + 1) / 400;
    ctx.strokeStyle = `rgb(${244 - a * 30},${238 - a * 34},${222 - a * 40})`;
    ctx.lineWidth = 11 * (1 - a) + 2;
    ctx.beginPath();
    ctx.moveTo(...toPx(a, 0));
    ctx.lineTo(...toPx(b, 0));
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function vaneGeometry() {
  const { L, xv0, wide } = QUILL;
  const ymax = wide * 1.12;
  const g = new THREE.PlaneGeometry(L - xv0, ymax * 2, 96, 12);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + (L - xv0) / 2 + xv0;
    const y = pos.getY(i);
    pos.setXYZ(i, x, y + bendY(x), bendZ(x) - 0.55 * y * y - 0.08 * Math.abs(y) * (x / L));
  }
  g.computeVertexNormals();
  return g;
}

function shaftGeometry() {
  const { L, xv0 } = QUILL;
  // radius profile along x
  const prof = [
    [0, 0], [0.02, 0.006], [0.1, 0.018], [0.18, 0.025], [xv0 * 0.9, 0.028],
    [xv0 + 0.1, 0.02], [xv0 + 0.6, 0.012], [L - 0.25, 0.005], [L, 0.001],
  ];
  const pts = [];
  for (let i = 0; i < prof.length - 1; i++) {
    const [xa, ra] = prof[i], [xb, rb] = prof[i + 1];
    for (let s = 0; s < 8; s++) {
      const t = s / 8;
      pts.push(new THREE.Vector2(ra + (rb - ra) * t, xa + (xb - xa) * t));
    }
  }
  pts.push(new THREE.Vector2(0.0005, L));
  const g = new THREE.LatheGeometry(pts, 20);
  g.rotateZ(-Math.PI / 2); // lathe axis Y → X
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const horn = new THREE.Color(0xdccdae), ink = new THREE.Color(0x15110f), white = new THREE.Color(0xf1e9d8);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    pos.setY(i, pos.getY(i) + bendY(x));
    pos.setZ(i, pos.getZ(i) + bendZ(x) + 0.012);
    const stain = clamp((x - 0.07) / 0.12);
    c.copy(ink).lerp(horn, stain).lerp(white, clamp((x - xv0) / 0.4) * 0.8);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

export function createQuill() {
  const group = new THREE.Group();
  const map = featherTexture();

  const vane = new THREE.Mesh(
    vaneGeometry(),
    new THREE.MeshStandardMaterial({
      map, transparent: false, alphaTest: 0.5, alphaToCoverage: true,
      side: THREE.DoubleSide, roughness: 0.78, metalness: 0,
      emissive: 0x2a2016, emissiveIntensity: 0.18,
    })
  );
  vane.castShadow = true;
  vane.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.5 });

  const shaft = new THREE.Mesh(
    shaftGeometry(),
    new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.3, sheen: 0.3 })
  );
  shaft.castShadow = true;

  const pivot = new THREE.Group(); // lets us roll the whole quill around its own axis
  pivot.add(vane, shaft);
  group.add(pivot);
  return { group, pivot, vane, shaft, map };
}

/* ---------- orientation helpers ---------- */

const X = new THREE.Vector3(1, 0, 0);
const _q = new THREE.Quaternion(), _r = new THREE.Quaternion();

/** Quaternion pointing local +X along dir, rolled around it by `roll`, with the vane facing `faceHint`. */
export function aim(dir, roll = 0, faceHint = new THREE.Vector3(0, 0, 1), out = new THREE.Quaternion()) {
  const d = dir.clone().normalize();
  // Build a basis: x = d, z = component of faceHint orthogonal to d
  const z = faceHint.clone().sub(d.clone().multiplyScalar(faceHint.dot(d)));
  if (z.lengthSq() < 1e-6) z.set(0, 1, 0);
  z.normalize();
  const y = new THREE.Vector3().crossVectors(z, d);
  const m = new THREE.Matrix4().makeBasis(d, y, z);
  out.setFromRotationMatrix(m);
  if (roll) out.premultiply(_r.setFromAxisAngle(d, roll));
  return out;
}

export { X, _q };
