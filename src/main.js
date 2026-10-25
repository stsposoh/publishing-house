import * as THREE from 'three';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { createStage } from './stage.js';
import { createBackground } from './background.js';
import { createQuill } from './quill.js';
import { createHero } from './hero.js';
import { buildPages } from './pages.js';
import { createBook } from './book.js';
import { createScenes, P } from './scenes.js';
import { createVortex } from './vortex.js';
import { createSky } from './sky.js';
import { createConstellation, SIRIUS_AT } from './constellation.js';
import { reducedMotion, seg, ease } from './util.js';

gsap.registerPlugin(ScrollTrigger);
history.scrollRestoration = 'manual';
window.scrollTo(0, 0);

const params = new URLSearchParams(location.search);

async function boot() {
  await Promise.all([
    document.fonts.load('400 40px Boska'),
    document.fonts.load('italic 400 40px Boska'),
    document.fonts.load('500 40px Boska'),
    document.fonts.load('400 20px "Newsreader Variable"'),
    document.fonts.load('italic 400 20px "Newsreader Variable"'),
    document.fonts.load('400 12px "Fragment Mono"'),
  ]);

  const stage = createStage(document.getElementById('gl'));
  const { scene, camera, renderer, view } = stage;
  const bg = createBackground();
  scene.add(bg.mesh);

  const quill = createQuill();
  scene.add(quill.group);

  const [hero, pageTextures] = await Promise.all([createHero(stage, quill), buildPages()]);
  pageTextures.forEach((t) => renderer.initTexture(t));
  const book = createBook(pageTextures);
  scene.add(book.group);
  const vortex = createVortex();
  scene.add(vortex.group);
  const sky = createSky(stage);
  scene.add(sky.sprite);
  const skyLayer = document.querySelector('.sky');
  const constellation = createConstellation(skyLayer);
  const scenes = createScenes({ stage, hero, book, quill, vortex, sky, bg, signature: hero.signature, siriusAt: SIRIUS_AT });
  const pose = { tip: new THREE.Vector3(), q: new THREE.Quaternion() };

  /* ---------- scroll ---------- */
  const lenis = new Lenis({ autoRaf: false, lerp: 0.085, wheelMultiplier: 0.9, smoothWheel: !reducedMotion });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  lenis.stop();

  const UNITS = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--units'));
  const S = { p: 0 };
  ScrollTrigger.create({
    trigger: '#track', start: 'top top', end: 'bottom bottom',
    onUpdate: (self) => { S.p = self.progress * UNITS; },
  });

  /* ---------- intro ---------- */
  let introDone = false;
  const ui = ['.logo', '.menu a', '.hero__sub', '.hero__est', '.hero__cue', '.feet'];
  const unlock = () => {
    if (introDone) return;
    introDone = true;
    document.body.classList.remove('is-intro');
    gsap.fromTo(ui.join(','), { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 1.1, ease: 'expo.out', stagger: 0.06 });
    if (!reducedMotion) gsap.to(hero.I, { bob: 1, duration: 1.2 });
    lenis.start();
  };
  const intro = hero.introTimeline({ onUnlock: unlock });
  document.querySelector('.loader').classList.add('is-done');

  /* menu: glide to the scene that answers each link */
  const track = document.getElementById('track');
  const toUnit = (p) => (p / UNITS) * (track.offsetHeight - innerHeight);
  const TARGETS = { '#books': 11.4, '#authors': 11.4, '#about': 2.3, '#submissions': UNITS, '#top': 0 };
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || !introDone) return;
    const href = a.getAttribute('href');
    e.preventDefault();
    if (href in TARGETS) lenis.scrollTo(toUnit(TARGETS[href]), { duration: reducedMotion ? 0 : 2.4, easing: (t) => 1 - Math.pow(1 - t, 4) });
    else lenis.scrollTo(document.querySelector(href) ?? 0, { duration: reducedMotion ? 0 : 2.4 });
  });

  if (params.has('t')) {
    const t = parseFloat(params.get('t'));
    intro.seek(t);
    if (t >= hero.K.lay1) unlock();
  } else if (params.has('p') || reducedMotion) {
    hero.finishIntro();
    intro.progress(1);
    unlock();
    if (params.has('p')) {
      lenis.scrollTo(toUnit(parseFloat(params.get('p'))), { immediate: true, force: true });
    }
  } else {
    intro.play();
  }

  /* ---------- running feet & masthead ---------- */
  const CHAPTERS = [
    [0.6, '01', 'Lantern Row'],
    [1.5, '02', 'A feather, let go'],
    [2.55 + 0.45, '03', 'The House'],
    [4.35 + 0.45, '03', 'New this season'],
    [6.0, '03', 'The Craft'],
    [8.25, '04', 'In the wind'],
    [9.7, '05', 'RA 06h 45m 08.9s · Dec −16° 42′ 58″'],
    [12.3, '06', 'Catalogue · seven titles'],
    [Infinity, '07', 'Submissions'],
  ];
  const masthead = document.querySelector('.masthead');
  const feet = document.querySelector('.feet');
  const folioEl = feet.querySelector('.feet__folio');
  const labelEl = feet.querySelector('.feet__label');
  let chapter = -1;
  function updateChrome(p, night) {
    const i = CHAPTERS.findIndex(([end]) => p < end);
    if (i !== chapter) {
      chapter = i;
      folioEl.textContent = `№ ${CHAPTERS[i][1]} / 07`;
      labelEl.textContent = CHAPTERS[i][2];
    }
    const h = night.head ? 'night' : 'paper', f = night.feet ? 'night' : 'paper';
    if (masthead.dataset.tone !== h) masthead.dataset.tone = h;
    if (feet.dataset.tone !== f) feet.dataset.tone = f;
  }

  /* ---------- finale type ---------- */
  const finale = document.querySelector('.finale');
  function updateFinale(p) {
    const on = p > P.finale[0] - 0.05;
    finale.style.visibility = on ? 'visible' : 'hidden';
    if (!on) return;
    const k = (a, b) => ease.expoOut(seg(p, a, b)).toFixed(3);
    const f0 = P.finale[0];
    finale.style.setProperty('--k1', k(f0, f0 + 0.4));
    finale.style.setProperty('--k2', k(f0 + 0.12, f0 + 0.52));
    finale.style.setProperty('--k3', k(f0 + 0.3, f0 + 0.7));
    finale.style.setProperty('--k4', k(f0 + 0.45, f0 + 0.85));
    finale.classList.toggle('is-live', p > f0 + 0.5);
  }

  /* ---------- frame ---------- */
  const heroLayer = document.querySelector('.hero');
  const timer = new THREE.Timer();
  function frame() {
    timer.update();
    const time = timer.getElapsed();
    bg.uniforms.uTime.value = time;

    const hs = hero.applyScroll(S.p, time);
    heroLayer.style.transform = `translate3d(0, ${-hs.dyPx}px, 0)`;
    heroLayer.style.visibility = hs.out >= 1 ? 'hidden' : '';
    hero.applyIntro(pose);
    scenes.apply(S.p, time, pose);
    const night = scenes.applyEnv(S.p);
    constellation.update(S.p, P);
    hero.signature.update(S.p, P);
    updateFinale(S.p);
    updateChrome(S.p, night);

    quill.group.position.copy(pose.tip);
    quill.group.quaternion.copy(pose.q);

    renderer.render(scene, camera);
  }
  gsap.ticker.add(frame);

  function resize() {
    stage.resize();
    bg.uniforms.uRes.value.set(view.w * view.dpr, view.h * view.dpr);
    bg.uniforms.uDpr.value = view.dpr;
    hero.layout();
    scenes.layout();
    constellation.drawLines(view.w, view.h);
  }
  window.addEventListener('resize', resize);
  resize();

  window.__sirius = { stage, hero, book, scenes, intro, lenis, S, P };
}

boot();
