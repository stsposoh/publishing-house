import * as THREE from 'three';
import { rng, clamp } from './util.js';
import { COLORS } from './background.js';

/*
 * The whirlwind: torn scraps of manuscript, beads of ink and long ink curls
 * spiralling up around the quill. Driven by v (0..1 through the scene) and time.
 */

function scrapAtlas() {
  const S = 512, c = document.createElement('canvas');
  c.width = c.height = S * 2;
  const g = c.getContext('2d');
  const R = rng(11);
  const lines = ['the slow', 'Lantern', 'ink & thread', 'chapter', 'Sirius', 'we read', 'folio', 'proof'];
  for (let k = 0; k < 4; k++) {
    const ox = (k % 2) * S, oy = Math.floor(k / 2) * S;
    // torn outline
    g.save();
    g.beginPath();
    const n = 26;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rx = S * (0.36 + R() * 0.08), ry = S * (0.26 + R() * 0.12);
      const x = ox + S / 2 + Math.cos(a) * rx * (0.85 + R() * 0.22);
      const y = oy + S / 2 + Math.sin(a) * ry * (0.85 + R() * 0.22);
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.closePath();
    g.fillStyle = '#efe7d7';
    g.fill();
    g.clip();
    // ruled lines + scraps of handwriting
    g.strokeStyle = 'rgba(35,28,23,0.12)';
    g.lineWidth = 2;
    for (let y = oy + 60; y < oy + S; y += 44) { g.beginPath(); g.moveTo(ox, y); g.lineTo(ox + S, y); g.stroke(); }
    g.fillStyle = k % 2 ? '#1e2a4a' : '#231c17';
    g.font = `italic 400 ${54 + R() * 20}px Boska`;
    for (let j = 0; j < 4; j++) g.fillText(lines[(k * 2 + j) % lines.length], ox + 70 + R() * 40, oy + 150 + j * 88);
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createVortex() {
  const group = new THREE.Group();
  const R = rng(5);
  const atlas = scrapAtlas();

  /* scraps: four instanced meshes, one per atlas cell */
  const scraps = [];
  for (let k = 0; k < 4; k++) {
    const map = atlas.clone();
    map.repeat.set(0.5, 0.5);
    map.offset.set((k % 2) * 0.5, 0.5 - Math.floor(k / 2) * 0.5);
    map.needsUpdate = true;
    const geo = new THREE.PlaneGeometry(1, 1, 4, 1);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.pow(pos.getX(i) * 2, 2) * 0.08); // a little curl
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95 });
    const n = 46;
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = false;
    mesh.frustumCulled = false;
    const data = Array.from({ length: n }, () => ({
      r: 0.8 + R() * 3.4, a: R() * Math.PI * 2, h: R(), w: 0.6 + R() * 0.8,
      size: 0.12 + R() * 0.22, spin: new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).normalize(), sp: 1 + R() * 3,
      delay: R() * 0.25,
    }));
    scraps.push({ mesh, data });
    group.add(mesh);
  }

  /* ink beads */
  const beadMat = new THREE.MeshPhysicalMaterial({ color: 0x161b29, roughness: 0.06, clearcoat: 1 });
  const beads = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 10), beadMat, 90);
  beads.frustumCulled = false;
  const beadData = Array.from({ length: 90 }, () => ({
    r: 0.5 + R() * 3.0, a: R() * Math.PI * 2, h: R(), w: 0.8 + R(), size: 0.007 + R() ** 3 * 0.028, delay: R() * 0.3,
  }));
  group.add(beads);

  /* ink curls: thin tubes along rising spirals, drawn progressively */
  const curls = [];
  const curlMat = new THREE.MeshStandardMaterial({ color: COLORS.ink, roughness: 0.4 });
  for (let k = 0; k < 9; k++) {
    const r0 = 0.9 + R() * 2.6, a0 = R() * Math.PI * 2, turns = 0.3 + R() * 0.5, z0 = R() * 1.5;
    const ox = (R() - 0.5) * 1.6, oy = (R() - 0.5) * 1.2, squash = 0.55 + R() * 0.4;
    const pts = [];
    for (let i = 0; i <= 80; i++) {
      const t = i / 80;
      const a = a0 + t * turns * Math.PI * 2;
      const r = r0 * (1 - t * 0.35);
      // ink thins and wavers along the curl
      const wob = 1 + Math.sin(t * 9 + a0) * 0.04;
      pts.push(new THREE.Vector3(ox + Math.cos(a) * r * wob, oy + Math.sin(a) * r * squash * wob, z0 + t * 2));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const geo = new THREE.TubeGeometry(curve, 160, 0.006 + R() * 0.008, 6, false);
    const mesh = new THREE.Mesh(geo, curlMat);
    mesh.frustumCulled = false;
    mesh.rotation.set((R() - 0.5) * 1.1, (R() - 0.5) * 1.1, 0);
    curls.push({ mesh, count: geo.index.count, delay: R() * 0.25, speed: 0.4 + R() * 0.5 });
    group.add(mesh);
  }

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);

  /**
   * v: progress through the vortex scene (0..1), time: seconds.
   * Particles gather in the first fifth, swirl, and are spent by the end.
   */
  function update(v, time) {
    group.visible = v > 0 && v < 1;
    if (!group.visible) return;
    const swirl = v * 7 + time * 0.18;
    for (const { mesh, data } of scraps) {
      data.forEach((d, i) => {
        const life = clamp((v - d.delay) / 0.22) * (1 - clamp((v - 0.78) / 0.2));
        if (life <= 0) { mesh.setMatrixAt(i, zero); return; }
        const a = d.a + swirl * d.w / Math.sqrt(d.r) * 1.6;
        const r = d.r * (1.2 - 0.4 * v);
        p.set(Math.cos(a) * r, Math.sin(a) * r * 0.75, 0.3 + d.h * 3.5 + v * 3.2);
        q.setFromAxisAngle(d.spin, time * d.sp + v * 12 * d.sp);
        s.setScalar(d.size * life);
        m.compose(p, q, s);
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
    beadData.forEach((d, i) => {
      const life = clamp((v - d.delay) / 0.2) * (1 - clamp((v - 0.75) / 0.2));
      if (life <= 0) { beads.setMatrixAt(i, zero); return; }
      const a = d.a + swirl * d.w / Math.sqrt(d.r) * 2.0;
      const r = d.r * (1.1 - 0.45 * v);
      p.set(Math.cos(a) * r, Math.sin(a) * r * 0.75, 0.2 + d.h * 4 + v * 3.5);
      // beads stretch along their path, as fast-moving drops do
      q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), a + Math.PI / 2);
      s.set(d.size * (1 + 1.4 * life), d.size * 0.85, d.size * 0.85).multiplyScalar(life);
      m.compose(p, q, s);
      beads.setMatrixAt(i, m);
    });
    beads.instanceMatrix.needsUpdate = true;
    for (const c of curls) {
      const grow = clamp((v - c.delay) / c.speed);
      const fade = clamp((v - 0.7) / 0.25);
      const start = Math.floor(c.count * fade / 3) * 3;
      const end = Math.floor(c.count * grow / 3) * 3;
      c.mesh.geometry.setDrawRange(start, Math.max(0, end - start));
      c.mesh.rotation.z = swirl * 0.35 * c.speed;
    }
  }

  group.visible = false;
  return { group, update };
}
