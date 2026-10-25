import * as THREE from 'three';
import gsap from 'gsap';
import { loadSirius, makeArrow, schedule, penAt, arrivalTexture, inkMaterial } from './handwriting.js';
import { createInkwell } from './inkwell.js';
import { aim } from './quill.js';
import { clamp, ease, reducedMotion } from './util.js';
import { COLORS } from './background.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** Hero layout in viewport fractions (desktop only, 1440–1920). */
export const HERO = {
  word: { cx: 0.435, top: 0.15, w: 0.6 },
  arrow: { cx: 0.435, cy: 0.835, h: 0.15 },
  well: { x: 0.865, y: 0.7 },
  wellStart: { x: 0.5, y: 0.56 },
  rest: { x: 0.285, y: 0.645, angle: 0.035 },
  sig: { cx: 0.745, cy: 0.6, w: 0.2 },
  sigRest: { x: 0.585, y: 0.79, angle: -0.14 },
};

export async function createHero(stage, quill) {
  const { scene, pxToWorld, pxLen, view } = stage;

  /* ---------- ink: word ---------- */
  const sirius = await loadSirius(`${import.meta.env.BASE_URL}sirius.svg`);
  const wordSched = schedule(sirius.strokes, { speed: 1250, lift: 0.075, liftSpeed: 2700, dotTime: 0.06 });
  const wordTex = arrivalTexture(sirius.strokes, wordSched, sirius.box, 2600);
  const wordMat = inkMaterial(wordTex.tex, wordSched.total);
  const word = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), wordMat);
  word.renderOrder = 2;
  scene.add(word);

  /* ---------- ink: arrow ---------- */
  const arrowSrc = makeArrow();
  const arrowSched = schedule(arrowSrc.strokes, { speed: 520, lift: 0.08, liftSpeed: 900 });
  const arrowTex = arrivalTexture(arrowSrc.strokes, arrowSched, arrowSrc.box, 420);
  const arrowMat = inkMaterial(arrowTex.tex, arrowSched.total);
  const arrow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), arrowMat);
  arrow.renderOrder = 2;
  scene.add(arrow);

  /* ---------- finale signature: same hand, smaller and quicker, in cinnabar ---------- */
  const sigSched = schedule(sirius.strokes, { speed: 2300, lift: 0.045, liftSpeed: 4600, dotTime: 0.04 });
  const sigTex = arrivalTexture(sirius.strokes, sigSched, sirius.box, 1400);
  const sigMat = inkMaterial(sigTex.tex, sigSched.total, { fresh: 0xe8603a, dry: COLORS.cinnabar, dryTime: 0.9 });
  const sig = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), sigMat);
  sig.renderOrder = 2;
  sig.visible = false;
  scene.add(sig);

  /* ---------- inkwell ---------- */
  const well = createInkwell();
  scene.add(well.group);

  const L = { wordW: 1, wordH: 1, arrowW: 1, arrowH: 1 };
  const base = { word: V(0, 0, 0), arrow: V(0, 0, 0), well: V(0, 0, 0), wellStart: V(0, 0, 0) };

  function layout() {
    const W = view.w, H = view.h;
    const ww = W * HERO.word.w;
    const wh = ww * (sirius.box.h / sirius.box.w);
    L.wordW = pxLen(ww); L.wordH = pxLen(wh);
    word.scale.set(L.wordW, L.wordH, 1);
    pxToWorld(W * HERO.word.cx, H * HERO.word.top + wh / 2, base.word);

    const ah = H * HERO.arrow.h, aw = ah * (arrowSrc.box.w / arrowSrc.box.h);
    L.arrowW = pxLen(aw); L.arrowH = pxLen(ah);
    arrow.scale.set(L.arrowW, L.arrowH, 1);
    pxToWorld(W * HERO.arrow.cx, H * HERO.arrow.cy, base.arrow);

    pxToWorld(W * HERO.well.x, H * HERO.well.y, base.well);
    const sw = W * HERO.sig.w;
    sig.scale.set(pxLen(sw), pxLen(sw * (sirius.box.h / sirius.box.w)), 1);
    pxToWorld(W * HERO.sig.cx, H * HERO.sig.cy, sig.position);
    pxToWorld(W * HERO.wellStart.x, H * HERO.wellStart.y, base.wellStart);

    // DOM anchors
    const root = document.documentElement.style;
    root.setProperty('--sub-x', `${W * (HERO.word.cx + HERO.word.w * 0.47)}px`);
    root.setProperty('--sub-y', `${H * HERO.word.top + wh * 1.0}px`);
    root.setProperty('--cue-x', `${W * HERO.arrow.cx + aw * 0.75}px`);
    root.setProperty('--cue-y', `${H * HERO.arrow.cy + ah * 0.18}px`);
  }
  layout();

  /* ---------- pen poses ---------- */
  const tmp = V(0, 0, 0);
  const pt = { x: 0, y: 0, lift: 0 };
  const writeDir = V(0.56, 0.6, 0.57).normalize();
  const face = V(-0.15, 0.1, 1);

  function inkPoint(mesh, box, sched, t, out) {
    penAt(sched, t, pt);
    const u = (pt.x - box.x) / box.w, v = (pt.y - box.y) / box.h;
    out.set((u - 0.5) * mesh.scale.x, (0.5 - v) * mesh.scale.y, 0).add(mesh.position);
    out.z += pt.lift * 0.32 + 0.004;
    return out;
  }

  function poseWell(pose) {
    pose.tip.copy(well.group.position).add(tmp.set(0, 0, 0.42));
    aim(V(-0.36, 0.42, 0.83), -0.3, face, pose.q);
  }
  function poseWrite(pose, mesh, box, sched, t) {
    inkPoint(mesh, box, sched, t, pose.tip);
    // the hand rocks a little as it writes
    const d = tmp.copy(writeDir);
    d.x += Math.sin(t * 9.0) * 0.03; d.y += Math.cos(t * 7.0) * 0.025;
    aim(d, Math.sin(t * 5) * 0.06, face, pose.q);
  }
  function poseRest(pose) {
    pxToWorld(view.w * HERO.rest.x, view.h * HERO.rest.y, pose.tip);
    pose.tip.z = 0.035;
    aim(V(Math.cos(HERO.rest.angle), Math.sin(HERO.rest.angle), 0), 0, V(0, 0, 1), pose.q);
  }

  const mkPose = () => ({ tip: V(0, 0, 0), q: new THREE.Quaternion() });
  const A = mkPose(), B = mkPose();

  /* ---------- intro timeline ---------- */
  /*
   * One clock drives the whole intro; every phase is derived from it.
   * well ─ lift ─ write "Sirius" ─ hop ─ arrow ─ lay the pen down ─ (ink keeps drying)
   */
  const I = { time: 0, bob: 0 };
  const T = { write: wordSched.total, arrow: arrowSched.total };
  const K = {};
  K.well0 = 0.25; K.well1 = 1.5;
  K.lift0 = 1.3; K.lift1 = 2.15;
  K.write0 = K.lift1; K.write1 = K.write0 + T.write;
  K.hop1 = K.write1 + 0.42;
  K.arrow1 = K.hop1 + T.arrow;
  K.lay0 = K.arrow1 + 0.12; K.lay1 = K.lay0 + 1.0;
  K.end = K.lay1 + 1.6;

  function introTimeline({ onUnlock } = {}) {
    const tl = gsap.timeline({ paused: true });
    tl.to(I, { time: K.end, duration: K.end, ease: 'none' }, 0)
      .call(() => onUnlock?.(), null, K.lay1 - 0.25);
    return tl;
  }

  /** Apply the intro state to objects; returns the pen pose for this frame. */
  function applyIntro(pose) {
    const t = I.time;
    // inkwell is set down onto the desk from above
    const w = ease.expoOut(clamp((t - K.well0) / (K.well1 - K.well0)));
    const slide = ease.p3InOut(clamp((t - K.lift0 - 0.1) / (K.lift1 - K.lift0 + 0.5)));
    if (t < K.lift1 + 0.7) {
      well.group.position.lerpVectors(base.wellStart, base.well, slide).add(tmp.set(0, 0, (1 - w) * 2.4));
      well.group.rotation.z = (1 - w) * 0.5 - slide * 0.6;
      well.group.visible = w > 0.001;
    }

    wordMat.uniforms.uT.value = t > K.write0 ? t - K.write0 : -1;
    arrowMat.uniforms.uT.value = t > K.hop1 ? t - K.hop1 : -1;

    const prog = (a, b) => clamp((t - a) / (b - a));

    if (t < K.write0) {
      poseWell(A);
      poseWrite(B, word, sirius.box, wordSched, 0);
      const e = ease.p3InOut(prog(K.lift0, K.lift1));
      pose.tip.lerpVectors(A.tip, B.tip, e);
      pose.tip.z += Math.sin(Math.PI * e) * 1.1;
      pose.q.slerpQuaternions(A.q, B.q, ease.p2InOut(e));
    } else if (t < K.write1) {
      poseWrite(pose, word, sirius.box, wordSched, t - K.write0);
    } else if (t < K.hop1) {
      poseWrite(A, word, sirius.box, wordSched, T.write);
      poseWrite(B, arrow, arrowSrc.box, arrowSched, 0);
      const e = ease.p2InOut(prog(K.write1, K.hop1));
      pose.tip.lerpVectors(A.tip, B.tip, e);
      pose.tip.z += Math.sin(Math.PI * e) * 0.55;
      pose.q.slerpQuaternions(A.q, B.q, e);
    } else if (t < K.lay0) {
      poseWrite(pose, arrow, arrowSrc.box, arrowSched, Math.min(t - K.hop1, T.arrow));
    } else {
      poseWrite(A, arrow, arrowSrc.box, arrowSched, T.arrow);
      poseRest(B);
      const e = ease.p3InOut(prog(K.lay0, K.lay1));
      pose.tip.lerpVectors(A.tip, B.tip, e);
      pose.tip.z += Math.sin(Math.PI * e) * 0.9;
      pose.q.slerpQuaternions(A.q, B.q, ease.p2InOut(e));
    }
    return pose;
  }

  function finishIntro() { I.time = K.end; I.bob = reducedMotion ? 0 : 1; }

  /** Scroll: the whole sheet slides up and away as the reader turns the page. */
  function applyScroll(p, time) {
    const out = ease.p2In(clamp(p / 1.1));
    const dy = pxLen(view.h * 1.15) * out;
    word.position.copy(base.word); word.position.y += dy;
    arrow.position.copy(base.arrow); arrow.position.y += dy;
    // idle arrow bob once the page is ready
    const bob = I.bob * Math.sin(time * 2.2) * pxLen(7);
    arrow.position.y += bob * (1 - out);
    if (I.time >= K.lift1 + 0.7) { well.group.position.copy(base.well); well.group.position.y += dy * 1.05; }
    well.group.visible = dy < pxLen(view.h * 1.3);
    word.visible = arrow.visible = out < 1;
    return { dy, out, dyPx: view.h * 1.15 * out };
  }


  const signature = {
    mesh: sig, sched: sigSched,
    pose: (pose, t) => poseWrite(pose, sig, sirius.box, sigSched, t),
    rest: (pose) => {
      pxToWorld(view.w * HERO.sigRest.x, view.h * HERO.sigRest.y, pose.tip);
      pose.tip.z = 0.035;
      aim(V(Math.cos(HERO.sigRest.angle), Math.sin(HERO.sigRest.angle), 0), 0, V(0, 0, 1), pose.q);
    },
    update(p, P) {
      sig.visible = p > P.sign[0] - 0.05;
      const k = (p - P.sign[0]) / (P.sign[1] - P.sign[0]);
      // after the last touch the ink keeps drying a little faster than the scroll
      sigMat.uniforms.uT.value = k <= 0 ? -1 : k <= 1 ? k * sigSched.total : sigSched.total + (k - 1) * 4;
    },
  };

  return {
    signature,
    I, T, K, word, arrow, well, layout, introTimeline, applyIntro, applyScroll, finishIntro, poseRest,
    sirius, wordSched, wordTex, base, L,
  };
}
