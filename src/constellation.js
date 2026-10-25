import { clamp, seg, ease, rng } from './util.js';

/* The catalogue as a constellation. Positions are viewport fractions. */
export const SIRIUS_AT = { x: 0.43, y: 0.53 };

export const BOOKS = [
  { id: 1, title: 'The Cartographer of Small Rooms', author: 'Ilse Varga', genre: 'Novel', year: 2026, x: 0.285, y: 0.3, mag: 1.0,
    blurb: 'A mapmaker charts the apartment she can no longer leave.', cloth: '#2f3a4a', ink: '#e9e1cf' },
  { id: 2, title: 'Salt Hours', author: 'Tomás Arrieta', genre: 'Poetry', year: 2026, x: 0.545, y: 0.205, mag: 0.95,
    blurb: 'Forty poems written on the night ferries between Vigo and the islands.', cloth: '#8a3b2a', ink: '#f1e6d2' },
  { id: 3, title: 'A Grammar of Fog', author: 'Neve Aldous', genre: 'Essays', year: 2025, x: 0.655, y: 0.43, mag: 0.8,
    blurb: 'Essays on things we only see when visibility is poor.', cloth: '#b9b3a6', ink: '#2a2420' },
  { id: 4, title: 'Nine Letters to an Absent Moon', author: 'Kaito Morrow', genre: 'Correspondence', year: 2025, x: 0.6, y: 0.735, mag: 0.75,
    blurb: 'Letters from a lighthouse keeper to the one thing that never answers.', cloth: '#1c2433', ink: '#d8c9a8' },
  { id: 5, title: 'The Glass Orchard', author: 'Petra Lindqvist', genre: 'Novel', year: 2024, x: 0.405, y: 0.82, mag: 0.65,
    blurb: 'Three sisters inherit an orchard where the fruit rings when it falls.', cloth: '#5d6b4e', ink: '#efe6d2' },
  { id: 6, title: 'Field Notes from the Edge of Sleep', author: 'Oren Hale', genre: 'Illustrated prose', year: 2024, x: 0.225, y: 0.655, mag: 0.6,
    blurb: 'Drawings and notes made in the minute before falling asleep, over ten years.', cloth: '#d9cbb0', ink: '#2a2420' },
  { id: 7, title: 'What the River Kept', author: 'Mira Solenne', genre: 'Short stories', year: 2023, x: 0.13, y: 0.43, mag: 0.55,
    blurb: 'Seven stories about objects that floated downstream and were found.', cloth: '#3f5560', ink: '#ece3cf' },
];

const EDGES = [[0, 1], [1, 2], [2, 3], [0, 3], [3, 4], [4, 5], [5, 0], [5, 6], [6, 7], [7, 1]];

const pad = (n) => String(n).padStart(2, '0');

function coverHTML(b) {
  const words = b.title.split(' ');
  return `
    <div class="cover" style="--cloth:${b.cloth};--cink:${b.ink}">
      <span class="cover__no">Sirius · ${pad(b.id)}</span>
      <span class="cover__title">${words.map((w) => `<span>${w}</span>`).join(' ')}</span>
      <span class="cover__author">${b.author}</span>
      <svg class="cover__star" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 0l1.6 8.4L20 10l-8.4 1.6L10 20l-1.6-8.4L0 10l8.4-1.6z"/></svg>
    </div>`;
}

export function createConstellation(root) {
  const starsEl = root.querySelector('.sky__stars');
  const linesEl = root.querySelector('.sky__lines');
  const card = root.querySelector('.card');
  const head = root.querySelector('.sky__head');

  const nodes = [{ id: 0, title: 'Sirius', author: 'The house', genre: 'Publishing house', year: 1987, x: SIRIUS_AT.x, y: SIRIUS_AT.y, mag: 1.3,
    blurb: 'A small press on Lantern Row, Edinburgh. Every star around it is a book we have made.' }, ...BOOKS];

  // stars
  starsEl.innerHTML = nodes.map((b, i) => `
    <li class="star${i === 0 ? ' star--sirius' : ''}" style="--x:${b.x};--y:${b.y};--m:${b.mag}">
      <button type="button" class="star__btn" data-i="${i}"
        aria-label="${b.title}${b.id ? `, by ${b.author}. ${b.genre}, ${b.year}` : ', the house, est. 1987'}">
        <span class="star__glow" aria-hidden="true"></span>
      </button>
      <span class="sky__label" aria-hidden="true">${b.id ? `${pad(b.id)} · ${b.genre}` : 'α CMa · Est. 1987'}</span>
    </li>`).join('');
  const starEls = [...starsEl.querySelectorAll('.star')];

  // ink lines, each a slightly wavering hand-drawn stroke
  const R = rng(3);
  let paths = [];
  function drawLines(w, h) {
    linesEl.setAttribute('viewBox', `0 0 ${w} ${h}`);
    linesEl.innerHTML = EDGES.map(([a, b]) => {
      const A = nodes[a], B = nodes[b];
      const ax = A.x * w, ay = A.y * h, bx = B.x * w, by = B.y * h;
      const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
      // shorten so lines stop short of the stars, like an atlas
      const k0 = 22 / len, k1 = 1 - 22 / len;
      const sx = ax + dx * k0, sy = ay + dy * k0, ex = ax + dx * k1, ey = ay + dy * k1;
      const bow = (R() - 0.5) * len * 0.08;
      const cx = (sx + ex) / 2 - (dy / len) * bow, cy = (sy + ey) / 2 + (dx / len) * bow;
      return `<path d="M${sx.toFixed(1)},${sy.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}"/>`;
    }).join('');
    paths = [...linesEl.querySelectorAll('path')].map((el) => {
      const L = el.getTotalLength();
      el.style.strokeDasharray = `${L} ${L}`;
      el.style.strokeDashoffset = L;
      return { el, L };
    });
  }

  // hover card
  let active = -1;
  function show(i) {
    if (active === i) return;
    active = i;
    const b = nodes[i];
    const left = b.x > 0.5;
    card.innerHTML = `
      ${b.id ? coverHTML(b) : '<div class="cover cover--house"><span class="cover__title"><span>Sirius</span></span><span class="cover__author">Publishing House · Est. 1987</span></div>'}
      <div class="card__text">
        <p class="card__meta">${b.id ? `№ ${pad(b.id)} · ${b.genre} · ${b.year}` : 'α Canis Majoris · The house'}</p>
        <h3 class="card__title">${b.title}</h3>
        ${b.id ? `<p class="card__author">${b.author}</p>` : ''}
        <p class="card__blurb">${b.blurb}</p>
      </div>`;
    card.hidden = false;
    card.dataset.side = left ? 'left' : 'right';
    card.style.setProperty('--x', b.x);
    card.style.setProperty('--y', b.y);
    card.classList.remove('is-open');
    void card.offsetWidth;
    card.classList.add('is-open');
    starEls.forEach((el, k) => el.classList.toggle('is-active', k === i));
    root.classList.add('has-active');
  }
  function hide() {
    active = -1;
    card.classList.remove('is-open');
    starEls.forEach((el) => el.classList.remove('is-active'));
    root.classList.remove('has-active');
  }
  starsEl.addEventListener('pointerover', (e) => { const b = e.target.closest('.star__btn'); if (b) show(+b.dataset.i); });
  starsEl.addEventListener('pointerout', (e) => { if (!e.relatedTarget?.closest?.('.star__btn')) hide(); });
  starsEl.addEventListener('focusin', (e) => { const b = e.target.closest('.star__btn'); if (b) show(+b.dataset.i); });
  starsEl.addEventListener('focusout', () => hide());

  /**
   * Scroll-driven: stars ignite one after another, the ink lines draw themselves,
   * fresh strokes glint blue before settling into starlight.
   */
  function update(p, P) {
    const on = p > P.flash[0] && p < P.drain[1];
    root.style.visibility = on ? 'visible' : 'hidden';
    if (!on) { if (active >= 0) hide(); return; }
    const fadeOut = 1 - ease.p2In(seg(p, P.drain[0], P.drain[0] + 0.35));
    root.style.opacity = fadeOut;
    const interactive = p > P.stars[1] - 0.15 && p < P.hold[1];
    root.classList.toggle('is-live', interactive);
    if (!interactive && active >= 0) hide();

    starEls.forEach((el, i) => {
      // Sirius is lit by the flash; the books follow in catalogue order
      const k = i === 0 ? seg(p, P.flash[0] + 0.2, P.flash[1] + 0.05)
        : seg(p, P.stars[0] + (i - 1) * 0.1, P.stars[0] + (i - 1) * 0.1 + 0.3);
      el.style.setProperty('--on', ease.expoOut(k).toFixed(3));
    });
    paths.forEach(({ el, L }, i) => {
      const k = seg(p, P.lines[0] + i * 0.06, P.lines[0] + i * 0.06 + 0.4);
      el.style.strokeDashoffset = (L * (1 - ease.p2InOut(k))).toFixed(1);
      el.style.setProperty('--dry', clamp((p - (P.lines[0] + i * 0.06 + 0.4)) / 0.5).toFixed(3));
    });
    const h = ease.expoOut(seg(p, P.stars[0] + 0.2, P.stars[0] + 0.8));
    head.style.setProperty('--in', h.toFixed(3));
  }

  return { update, drawLines, nodes };
}
