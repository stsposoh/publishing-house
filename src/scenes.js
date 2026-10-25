import * as THREE from 'three';
import { aim } from './quill.js';
import { BOOK } from './book.js';
import { clamp, lerp, seg, ease } from './util.js';

/*
 * Scroll choreography. Everything is a pure function of p (scroll units, 1 = one viewport),
 * so every scene plays identically forwards and backwards.
 */
export const P = {
  heroOut: [0, 1.1],
  fall: [0.04, 1.5],
  s1: [[1.35, 1.95], [1.55, 2.15]],
  turn1: [2.55, 3.45],
  s2: [[3.3, 3.9], [2.8, 3.4]],
  turn2: [4.35, 5.25],
  s3: [[5.1, 5.7], [4.6, 5.2]],
  vortex: [6.0, 8.2],
  bookOut: [6.0, 7.1],
  away: [8.25, 9.45],
  flood: [8.6, 9.4],
  flash: [9.32, 9.8],
  stars: [9.7, 10.6],
  lines: [10.0, 11.0],
  hold: [11.0, 12.3],
  drain: [12.3, 13.15],
  finale: [12.85, 13.45],
  sign: [13.3, 13.9],
};

export const heroOut = (p) => ease.p2In(seg(p, ...P.heroOut));

const V = () => new THREE.Vector3();
const _a = V(), _b = V(), _c = V(), _d = V(), _e = V();
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qz = new THREE.Quaternion();
const Z = new THREE.Vector3(0, 0, 1), Y = new THREE.Vector3(0, 1, 0);

function cubic(p0, p1, p2, p3, t, out) {
  const u = 1 - t;
  return out.set(0, 0, 0)
    .addScaledVector(p0, u * u * u).addScaledVector(p1, 3 * u * u * t)
    .addScaledVector(p2, 3 * u * t * t).addScaledVector(p3, t * t * t);
}

export function createScenes({ stage, hero, book, quill, vortex, sky, bg, signature, siriusAt }) {
  const { view, pxToWorld, pxLen, camera } = stage;
  const bookBase = V();
  let bookScale = 1;

  function layout() {
    pxToWorld(view.w * 0.5, view.h * 0.53, bookBase);
    bookScale = Math.min(1.05, (view.visW * 0.8) / (BOOK.PW * 2 + 0.24), (view.visH * 0.8) / (BOOK.PH + 0.2));
    book.group.scale.setScalar(bookScale);
  }
  layout();

  /* ---- bookmark pose in book space ---- */
  const markLocalTip = new THREE.Vector3(0.0, -0.3, 0);
  function poseMark(pose, hop = 0) {
    const h = ease.p2InOut(hop);
    const g = book.group;
    g.updateMatrixWorld();
    _a.copy(markLocalTip);
    _a.z = book.gutterZ;
    // leap over the turning leaf: left while it rises, back over its crest, down behind it
    _a.x += -1.15 * Math.sin(2 * Math.PI * h);
    _a.z += 3.7 * Math.sin(Math.PI * h);
    _a.y += 0.35 * Math.sin(Math.PI * h);
    g.localToWorld(pose.tip.copy(_a));
    _b.set(0.02 + 0.3 * Math.sin(2 * Math.PI * h), 1, -0.35 * Math.sin(Math.PI * h)).transformDirection(g.matrixWorld);
    aim(_b, 0, _c.set(0, 0, 1), pose.q);
    return pose;
  }

  const restPose = { tip: V(), q: new THREE.Quaternion() };
  const markPose = { tip: V(), q: new THREE.Quaternion() };

  /** Paper, ink flood, star field and drain. */
  function applyEnv(p) {
    const u = bg.uniforms;
    const sx = view.w * siriusAt.x, sy = view.h * siriusAt.y;
    u.uFloodOrigin.value.set(sx, sy);
    const maxR = Math.hypot(Math.max(sx, view.w - sx), Math.max(sy, view.h - sy)) + 420;
    u.uFloodR.value = ease.p2In(seg(p, ...P.flood)) * maxR;
    u.uStars.value = ease.p2InOut(seg(p, P.flood[1] - 0.15, P.stars[1]));
    u.uDrain.value = ease.p2InOut(seg(p, ...P.drain));
    // the masthead sits at the top (dark first, light first); the feet at the bottom
    const R = u.uFloodR.value, D = u.uDrain.value;
    return {
      head: R > sy + 160 && D < 0.08,
      feet: R > view.h - sy + 160 && D < 0.9,
    };
  }

  /** Returns true if scroll choreography controls the pen this frame. */
  function apply(p, time, pose) {
    /* ---------- book placement ---------- */
    const out = heroOut(p);
    const dyMax = pxLen(view.h * 1.15);
    const leave = ease.p3In(seg(p, ...P.bookOut));
    book.group.position.copy(bookBase);
    book.group.position.y -= dyMax * (1 - out);
    book.group.position.y -= leave * view.visH * 1.25;
    book.group.rotation.set(-leave * 0.5, 0, -0.02 + leave * 0.25);
    book.group.visible = out > 0.02 && leave < 1;

    /* ---------- spreads ---------- */
    const t1 = seg(p, ...P.turn1), t2 = seg(p, ...P.turn2);
    if (t1 <= 0) book.setState(0, null);
    else if (t1 < 1) book.setState(0, ease.p2InOut(t1));
    else if (t2 <= 0) book.setState(1, null);
    else if (t2 < 1) book.setState(1, ease.p2InOut(t2));
    else book.setState(2, null);
    const rv = (r) => ease.p2Out(seg(p, ...r));
    book.reveal(0, rv(P.s1[0])); book.reveal(1, rv(P.s1[1]));
    book.reveal(2, rv(P.s2[0])); book.reveal(3, rv(P.s2[1]));
    book.reveal(4, rv(P.s3[0])); book.reveal(5, rv(P.s3[1]));

    vortex.group.position.copy(bookBase);
    vortex.update(seg(p, ...P.vortex), time);

    /* ---------- pen ---------- */
    if (p <= P.fall[0]) return false; // the intro pose (lying under the word) stays

    if (p < P.fall[1]) {
      // a feather let go: it drifts down, swinging like a pendulum that loses its breath
      const e = seg(p, ...P.fall);
      hero.poseRest(restPose);
      poseMark(markPose);
      const k = ease.sineInOut(e);
      _a.copy(restPose.tip);
      _b.copy(restPose.tip).add(_e.set(0.5, -0.7, 1.4));
      _c.copy(markPose.tip).add(_e.set(-0.4, -0.2, 1.3));
      cubic(_a, _b, _c, markPose.tip, k, pose.tip);
      // the swing has to build up from rest, or the pen snaps on the first pixel of scroll
      const damp = (1 - e) ** 1.3 * ease.p2InOut(seg(e, 0, 0.18));
      const swing = Math.sin(2 * Math.PI * 2.1 * e);
      pose.tip.x += 1.0 * damp * swing;
      pose.tip.z += 0.25 * damp * Math.abs(swing);
      pose.q.slerpQuaternions(restPose.q, markPose.q, ease.p2InOut(seg(e, 0.15, 0.95)));
      // tilt into each swing, and a slow turn about its own shaft
      _qz.setFromAxisAngle(Z, 0.55 * damp * Math.cos(2 * Math.PI * 2.1 * e));
      pose.q.premultiply(_qz);
      quill.pivot.rotation.x = Math.sin(e * Math.PI * 2.6) * 0.9 * damp;
      return true;
    }
    quill.pivot.rotation.x = 0;

    if (p < P.vortex[0]) {
      // bookmark, hopping over each turning leaf
      const hop1 = seg(p, P.turn1[0] - 0.12, P.turn1[1] - 0.05);
      const hop2 = seg(p, P.turn2[0] - 0.12, P.turn2[1] - 0.05);
      poseMark(pose, hop1 > 0 && hop1 < 1 ? hop1 : hop2 > 0 && hop2 < 1 ? hop2 : 0);
      return true;
    }

    quill.group.visible = true;

    /* ---------- vortex & close-up ---------- */
    const v = seg(p, ...P.vortex);
    if (p < P.away[0]) {
      poseMark(markPose);
      poseCloseUp(_qa, _d, time);
      const a = ease.p2InOut(seg(v, 0, 0.62));
      const phi = 0.4 + a * Math.PI * 3.4;
      const R = 0.25 + 1.0 * Math.sin(Math.PI * Math.min(1, a * 1.05));
      _a.set(bookBase.x + Math.cos(phi) * R, bookBase.y + Math.sin(phi) * R * 0.8, book.gutterZ + a * 3.0);
      // tangent of the spiral, tipped upward
      _b.set(-Math.sin(phi), Math.cos(phi) * 0.8, 0.55);
      aim(_b, 0, Z, _qb);
      // leave the gutter gently, then hand over to the close-up
      const w0 = ease.p2InOut(seg(v, 0, 0.14));
      const w1 = ease.p3InOut(seg(v, 0.55, 1));
      pose.tip.lerpVectors(markPose.tip, _a, w0).lerp(_d, w1);
      pose.q.slerpQuaternions(markPose.q, _qb, w0).slerp(_qa, w1);
      quill.pivot.rotation.x = a * Math.PI * 4 * (1 - w1) + w1 * Math.sin(time * 0.6) * 0.12;
      sky.place(pose.tip, 0, 0);
      return true;
    }

    /* ---------- away into the dark, becoming Sirius ---------- */
    const sx = view.w * siriusAt.x, sy = view.h * siriusAt.y;
    const far = sky.rayPoint(sx, sy, 175, _e);
    if (p < P.flash[0] + 0.02) {
      const e = seg(p, ...P.away);
      poseCloseUp(_qa, _d, time);
      const k = ease.p3In(e);
      pose.tip.lerpVectors(_d, far, k);
      aim(_b.set(0.25, 0.35, -1), 0, Z, _qb);
      pose.q.slerpQuaternions(_qa, _qb, ease.p2InOut(seg(e, 0.05, 0.6)));
      quill.pivot.rotation.x = Math.sin(time * 0.6) * 0.12 + e * 2.5;
      quill.group.visible = e < 0.985;
      const glow = ease.p2InOut(seg(e, 0.35, 1));
      sky.place(pose.tip, 8 + glow * 56, glow);
      return true;
    }

    quill.group.visible = false;
    if (p < P.drain[0] + 0.7) {
      const f = seg(p, ...P.flash);
      let px = f < 0.32 ? 64 + 520 * ease.p2Out(f / 0.32) : 584 - 470 * ease.p3InOut((f - 0.32) / 0.68);
      px *= 1 + Math.sin(time * 2.7) * 0.04 * f;
      const fade = 1 - ease.p2Out(seg(p, P.drain[0], P.drain[0] + 0.22));
      sky.place(far, px, fade);
      return true;
    }
    sky.place(far, 0, 0);

    /* ---------- the quill comes back to sign ---------- */
    const back = seg(p, P.finale[0] + 0.1, P.sign[0]);
    quill.group.visible = back > 0;
    const sig = signature;
    const tSign = seg(p, ...P.sign) * sig.sched.total;
    if (p < P.sign[0]) {
      sig.pose(markPose, 0);
      _a.copy(markPose.tip).add(_e.set(3.2, 3.0, 2.6));
      const k = ease.p3Out(back);
      pose.tip.lerpVectors(_a, markPose.tip, k);
      pose.tip.z += Math.sin(Math.PI * k) * 0.6;
      aim(_b.set(0.9, 0.7, 0.8), 0, Z, _qb);
      pose.q.slerpQuaternions(_qb, markPose.q, ease.p2InOut(back));
    } else if (p < P.sign[1]) {
      sig.pose(pose, tSign);
    } else {
      sig.pose(markPose, sig.sched.total);
      sig.rest(restPose);
      const k = ease.p3InOut(seg(p, P.sign[1], 14));
      pose.tip.lerpVectors(markPose.tip, restPose.tip, k);
      pose.tip.z += Math.sin(Math.PI * k) * 0.5;
      pose.q.slerpQuaternions(markPose.q, restPose.q, k);
    }
    return true;
  }

  /** The feather nearly fills the frame, its barbs legible. */
  function poseCloseUp(q, tip, time) {
    const dir = _c.set(0.84, 0.46, -0.06).normalize();
    aim(dir, 0, _b.set(0, -0.15, 1), q);
    tip.set(0.1 + Math.sin(time * 0.4) * 0.03, -0.04 + Math.cos(time * 0.33) * 0.02, 6.25).addScaledVector(dir, -1.42);
  }

  return { apply, applyEnv, layout, poseMark };
}
