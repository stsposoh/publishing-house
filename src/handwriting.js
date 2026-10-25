import * as THREE from 'three';
import { srgb, COLORS } from './background.js';
import { GLSL_NOISE } from './util.js';

/* ------------------------------------------------------------------ *
 * Geometry
 * ------------------------------------------------------------------ */

const bez = (s, t) => {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return { x: a * s[0].x + b * s[1].x + c * s[2].x + d * s[3].x, y: a * s[0].y + b * s[1].y + c * s[2].y + d * s[3].y };
};

/** Parse calligrapher.ai outlines: each path is M + 2N cubic segments (forward side, then back). */
export function parseOutlines(svgText) {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const vb = doc.documentElement.getAttribute('viewBox').split(/\s+/).map(Number);
  const paths = [...doc.querySelectorAll('path')].map((el) => {
    const d = el.getAttribute('d');
    const n = d.match(/-?\d+\.?\d*/g).map(Number);
    let cur = { x: n[0], y: n[1] };
    const segs = [];
    for (let i = 2; i + 5 < n.length; i += 6) {
      const s = [cur, { x: n[i], y: n[i + 1] }, { x: n[i + 2], y: n[i + 3] }, { x: n[i + 4], y: n[i + 5] }];
      segs.push(s);
      cur = s[3];
    }
    return { d, segs };
  });
  return { vb: { x: vb[0], y: vb[1], w: vb[2], h: vb[3] }, paths };
}

/** Centre line of a filled calligraphic outline by pairing its two sides. */
export function centerline(segs, perSeg = 10) {
  const N = segs.length / 2;
  const out = [];
  for (let k = 0; k < N; k++) {
    const A = segs[k], B = segs[2 * N - 1 - k];
    for (let i = 0; i < perSeg; i++) {
      const t = i / perSeg;
      const a = bez(A, t), b = bez(B, 1 - t);
      out.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, w: Math.hypot(a.x - b.x, a.y - b.y) });
    }
  }
  const a = segs[N - 1][3];
  out.push({ x: a.x, y: a.y, w: 0 });
  return out;
}

/** Broad-nib stroke along a centre line (used for our own arrow and similar marks). */
export function broadNib(points, { nib = 11, angle = -0.62, minW = 1.6 } = {}) {
  const dx = Math.cos(angle) * 0.5, dy = Math.sin(angle) * 0.5;
  const n = points.length;
  const samples = points.map((p, i) => {
    const taper = Math.min(1, i / 6, (n - 1 - i) / 5) ** 0.6;
    const w = nib * (0.25 + 0.75 * taper);
    return { x: p.x, y: p.y, w, half: { x: dx * w, y: dy * w } };
  });
  const draw = (ctx, expand) => {
    ctx.beginPath();
    for (let i = 0; i < n - 1; i++) {
      const a = samples[i], b = samples[i + 1];
      ctx.moveTo(a.x - a.half.x, a.y - a.half.y);
      ctx.lineTo(a.x + a.half.x, a.y + a.half.y);
      ctx.lineTo(b.x + b.half.x, b.y + b.half.y);
      ctx.lineTo(b.x - b.half.x, b.y - b.half.y);
      ctx.closePath();
    }
    ctx.fill('nonzero');
    ctx.lineWidth = expand + minW;
    ctx.lineJoin = 'round';
    ctx.stroke();
  };
  return { samples: samples.map((s) => ({ x: s.x, y: s.y, w: s.w })), draw };
}

/** Smooth a polyline through control points (Catmull-Rom), returning dense points. */
export function spline(ctrl, steps = 14) {
  const out = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
    for (let s = 0; s < steps; s++) {
      const t = s / steps, t2 = t * t, t3 = t2 * t;
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  out.push(ctrl[ctrl.length - 1]);
  return out;
}

/* ------------------------------------------------------------------ *
 * Timing: a human hand slows on curves and eases in and out of strokes
 * ------------------------------------------------------------------ */

export function schedule(strokes, { speed = 700, lift = 0.11, liftSpeed = 1500, dotTime = 0.07 } = {}) {
  let t = 0;
  const timed = [];
  let prev = null;
  for (const st of strokes) {
    const pts = st.samples;
    if (prev) {
      const dist = Math.hypot(pts[0].x - prev.x, pts[0].y - prev.y);
      const gap = lift + dist / liftSpeed;
      timed.push({ type: 'lift', from: prev, to: pts[0], t0: t, t1: t + gap, dist });
      t += gap;
    }
    // arc length + curvature
    const len = [0];
    for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    const L = len[len.length - 1];
    const times = [t];
    if (st.dot || L < 14) {
      for (let i = 1; i < pts.length; i++) times.push(t + (len[i] / Math.max(L, 1e-6)) * dotTime);
    } else {
      const curv = pts.map((p, i) => {
        if (i === 0 || i === pts.length - 1) return 0;
        const a = Math.atan2(p.y - pts[i - 1].y, p.x - pts[i - 1].x);
        const b = Math.atan2(pts[i + 1].y - p.y, pts[i + 1].x - p.x);
        let d = Math.abs(b - a); if (d > Math.PI) d = 2 * Math.PI - d;
        return d / Math.max(1e-3, (len[i + 1] - len[i - 1]) / 2);
      });
      for (let i = 1; i < pts.length; i++) {
        const u = len[i] / L;
        const k = (curv[i] + curv[i - 1] + (curv[i - 2] || 0) + (curv[i + 1] || 0)) / 4;
        const v = speed * (0.32 + 0.68 * Math.sin(Math.PI * u) ** 0.55) / (1 + 7 * k);
        times.push(times[i - 1] + (len[i] - len[i - 1]) / Math.max(v, 30));
      }
    }
    t = times[times.length - 1];
    timed.push({ type: 'stroke', pts, times, t0: times[0], t1: t });
    prev = pts[pts.length - 1];
  }
  return { total: t, parts: timed, start: strokes[0].samples[0], end: prev };
}

/** Pen tip at time t (seconds): position in source units + lift (0 = on paper). */
export function penAt(sched, t, out = { x: 0, y: 0, lift: 0, writing: false }) {
  const parts = sched.parts;
  if (t <= 0) { Object.assign(out, sched.start, { lift: 0, writing: false }); return out; }
  for (const p of parts) {
    if (t > p.t1) continue;
    if (p.type === 'lift') {
      const u = (t - p.t0) / (p.t1 - p.t0);
      const e = u * u * (3 - 2 * u);
      out.x = p.from.x + (p.to.x - p.from.x) * e;
      out.y = p.from.y + (p.to.y - p.from.y) * e - Math.sin(Math.PI * u) * Math.min(26, p.dist * 0.12);
      out.lift = Math.sin(Math.PI * u) * Math.min(1, 0.35 + p.dist / 300);
      out.writing = false;
    } else {
      const { pts, times } = p;
      let i = 1;
      while (i < times.length - 1 && times[i] < t) i++;
      const u = (t - times[i - 1]) / Math.max(1e-6, times[i] - times[i - 1]);
      out.x = pts[i - 1].x + (pts[i].x - pts[i - 1].x) * u;
      out.y = pts[i - 1].y + (pts[i].y - pts[i - 1].y) * u;
      out.lift = 0;
      out.writing = true;
    }
    return out;
  }
  Object.assign(out, sched.end, { lift: 0, writing: false });
  return out;
}

/* ------------------------------------------------------------------ *
 * Arrival map: R = when the nib reaches this pixel, G = ink coverage
 * ------------------------------------------------------------------ */

export function arrivalTexture(strokes, sched, box, width) {
  const s = width / box.w;
  const W = Math.round(width), H = Math.round(box.h * s);
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const main = mk(), tmp = mk(), cov = mk(), mask = mk();
  const m = main.getContext('2d'), tc = tmp.getContext('2d'), cc = cov.getContext('2d'), mc = mask.getContext('2d');
  const toLocal = (ctx) => ctx.setTransform(s, 0, 0, s, -box.x * s, -box.y * s);

  m.fillStyle = '#fff'; m.fillRect(0, 0, W, H);
  const timedStrokes = sched.parts.filter((p) => p.type === 'stroke');

  for (let k = strokes.length - 1; k >= 0; k--) {
    const st = strokes[k], tp = timedStrokes[k];
    tc.setTransform(1, 0, 0, 1, 0, 0);
    tc.globalCompositeOperation = 'source-over';
    tc.clearRect(0, 0, W, H);
    toLocal(tc);
    const maxW = Math.max(...st.samples.map((p) => p.w));
    for (let i = st.samples.length - 1; i >= 0; i--) {
      const p = st.samples[i];
      const g = Math.round((tp.times[i] / sched.total) * 250);
      tc.fillStyle = `rgb(${g},${g},${g})`;
      tc.beginPath();
      tc.arc(p.x, p.y, Math.max(p.w * 0.72, maxW * 0.45, 2.5 / s) + 1.5 / s, 0, Math.PI * 2);
      tc.fill();
    }
    // keep only this stroke's (slightly dilated) shape
    mc.setTransform(1, 0, 0, 1, 0, 0);
    mc.clearRect(0, 0, W, H);
    toLocal(mc);
    mc.fillStyle = '#000'; mc.strokeStyle = '#000';
    st.draw(mc, 3 / s);
    tc.setTransform(1, 0, 0, 1, 0, 0);
    tc.globalCompositeOperation = 'destination-in';
    tc.drawImage(mask, 0, 0);
    m.drawImage(tmp, 0, 0);

    toLocal(cc);
    cc.fillStyle = '#000'; cc.strokeStyle = '#000';
    st.draw(cc, 0);
  }

  const a = m.getImageData(0, 0, W, H).data;
  const c = cc.getImageData(0, 0, W, H).data;
  const data = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    data[i * 4] = a[i * 4];
    data[i * 4 + 1] = c[i * 4 + 3];
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return { tex, W, H };
}

/* ------------------------------------------------------------------ *
 * Ink material: reveal behind the nib, then oxidise from blue to sepia
 * ------------------------------------------------------------------ */

export function inkMaterial(tex, total, { fresh = COLORS.inkFresh, dry = COLORS.ink, dryTime = 1.5 } = {}) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uMap: { value: tex },
      uTexel: { value: new THREE.Vector2(1 / tex.image.width, 1 / tex.image.height) },
      uT: { value: -1 },
      uTotal: { value: total },
      uDryTime: { value: dryTime },
      uFresh: { value: srgb(fresh) },
      uDry: { value: srgb(dry) },
      uOpacity: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; uniform vec2 uTexel;
      uniform float uT, uTotal, uDryTime, uOpacity;
      uniform vec3 uFresh, uDry;
      varying vec2 vUv;
      ${GLSL_NOISE}
      void main() {
        vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
        vec4 t = texture2D(uMap, uv);
        float cov = t.g;
        if (cov < 0.004) discard;
        float arrive = t.r / 0.98 * uTotal;
        float shown = smoothstep(arrive - 0.004, arrive + 0.03, uT);
        float age = uT - arrive;
        float dried = smoothstep(0.05, uDryTime, age);
        // ink pools at the stroke edges
        vec2 o = uTexel * 2.5;
        float nb = min(min(texture2D(uMap, uv + vec2(o.x, 0.)).g, texture2D(uMap, uv - vec2(o.x, 0.)).g),
                       min(texture2D(uMap, uv + vec2(0., o.y)).g, texture2D(uMap, uv - vec2(0., o.y)).g));
        float rim = 1.0 - nb;
        vec3 col = mix(uFresh, uDry, dried);
        col *= 0.92 + 0.14 * vnoise(uv * vec2(900.0, 300.0)) - rim * 0.18;
        // wet ink catches a little light before it sinks in
        col += (1.0 - dried) * 0.06 * (1.0 - rim);
        gl_FragColor = vec4(col, cov * shown * uOpacity * (0.93 + 0.07 * rim));
      }
    `,
  });
}

/* ------------------------------------------------------------------ *
 * The "Sirius" signature and the scroll arrow, ready to drop in a scene
 * ------------------------------------------------------------------ */

const ORDER = [0, 1, 3, 4, 6, 7, 2, 5]; // letters first, the two i-dots last

export async function loadSirius(url) {
  const svg = await (await fetch(url)).text();
  const { vb, paths } = parseOutlines(svg);
  const strokes = ORDER.map((i) => {
    const p = paths[i];
    const dot = i === 2 || i === 5;
    const path2d = new Path2D(p.d);
    let samples = centerline(p.segs, 10);
    // the generated i-dots are mere specks; give them a proper touch of the nib
    const k = dot ? 2.6 : 1;
    const c = samples.reduce((a, q) => ({ x: a.x + q.x / samples.length, y: a.y + q.y / samples.length }), { x: 0, y: 0 });
    if (dot) samples = samples.map((q) => ({ x: c.x + (q.x - c.x) * k, y: c.y + (q.y - c.y) * k, w: q.w * k }));
    return {
      samples,
      dot,
      draw: (ctx, expand) => {
        ctx.save();
        if (dot) { ctx.translate(c.x, c.y); ctx.scale(k, k); ctx.translate(-c.x, -c.y); }
        ctx.fill(path2d);
        if (expand) { ctx.lineWidth = expand / k; ctx.lineJoin = 'round'; ctx.stroke(path2d); }
        ctx.restore();
      },
    };
  });
  const pad = 14;
  const box = { x: vb.x - pad, y: vb.y - pad, w: vb.w + pad * 2, h: vb.h + pad * 2 };
  return { strokes, box };
}

/** A hand-drawn arrow pointing down, in the same broad-nib hand. Units ≈ SVG units. */
export function makeArrow() {
  const shaft = spline([
    { x: 52, y: 8 }, { x: 54, y: 40 }, { x: 51, y: 82 }, { x: 53, y: 124 }, { x: 52, y: 158 },
  ], 10);
  const head = spline([
    { x: 22, y: 118 }, { x: 37, y: 140 }, { x: 52, y: 163 }, { x: 68, y: 136 }, { x: 84, y: 113 },
  ], 10);
  const strokes = [broadNib(shaft, { nib: 10 }), broadNib(head, { nib: 10 })];
  const box = { x: 0, y: 0, w: 104, h: 176 };
  return { strokes, box };
}
