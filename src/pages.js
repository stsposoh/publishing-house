import * as THREE from 'three';

/*
 * Book pages typeset onto canvases (Retina), Van de Graaf canon margins:
 * inner = W/9, top = H/9, outer = 2W/9, bottom = 2H/9.
 */

export const PAGE = { W: 1300, H: 1768 };

const INK = '#231c17';
const SOFT = '#6a5c50';
const PAPER = '#eee6d6';
const CINNABAR = '#c23b22';

const F = {
  display: (s, it = false, w = 400) => `${it ? 'italic ' : ''}${w} ${s}px Boska`,
  text: (s, it = false, w = 400) => `${it ? 'italic ' : ''}${w} ${s}px "Newsreader Variable"`,
  mono: (s) => `400 ${s}px "Fragment Mono"`,
};

function wrap(ctx, text, maxW) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function text(ctx, str, x, y, { font, color = INK, spacing = '0px', align = 'left', base = 'alphabetic' } = {}) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.letterSpacing = spacing;
  ctx.textAlign = align;
  ctx.textBaseline = base;
  ctx.fillText(str, x, y);
}

function para(ctx, str, x, y, maxW, { font, lh, color = INK, firstIndent = 0, dropLines = 0, dropW = 0 } = {}) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.letterSpacing = '0px';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const words = str.split(/\s+/);
  let line = '', ly = y, n = 0;
  const widthFor = (i) => maxW - (i < dropLines ? dropW : 0) - (i === 0 ? firstIndent : 0);
  const xFor = (i) => x + (i < dropLines ? dropW : 0) + (i === 0 ? firstIndent : 0);
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > widthFor(n) && line) {
      ctx.fillText(line, xFor(n), ly);
      line = w; ly += lh; n++;
    } else line = test;
  }
  if (line) { ctx.fillText(line, xFor(n), ly); ly += lh; }
  return ly;
}

function rule(ctx, x, y, w, color = INK, alpha = 0.35, lw = 2) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, lw);
  ctx.restore();
}

/** Duotone a photo between ink and paper, cover-cropped into a box. */
function duotone(ctx, img, x, y, w, h, { fx = 0.5, fy = 0.5, contrast = 1.15, lift = 0.04 } = {}) {
  const c = document.createElement('canvas');
  c.width = Math.round(w); c.height = Math.round(h);
  const g = c.getContext('2d');
  const s = Math.max(w / img.width, h / img.height);
  const dw = img.width * s, dh = img.height * s;
  g.drawImage(img, (w - dw) * fx, (h - dh) * fy, dw, dh);
  const d = g.getImageData(0, 0, c.width, c.height);
  const a = d.data;
  const ink = [35, 28, 23], pap = [238, 230, 214];
  for (let i = 0; i < a.length; i += 4) {
    let l = (a[i] * 0.299 + a[i + 1] * 0.587 + a[i + 2] * 0.114) / 255;
    l = Math.min(1, Math.max(0, (l - 0.5) * contrast + 0.5 + lift));
    l = l * l * (3 - 2 * l) * 0.35 + l * 0.65;
    const grain = (Math.random() - 0.5) * 0.05;
    l = Math.min(1, Math.max(0, l + grain));
    a[i] = ink[0] + (pap[0] - ink[0]) * l;
    a[i + 1] = ink[1] + (pap[1] - ink[1]) * l;
    a[i + 2] = ink[2] + (pap[2] - ink[2]) * l;
  }
  g.putImageData(d, 0, 0);
  ctx.drawImage(c, x, y);
}

function blank() {
  const c = document.createElement('canvas');
  c.width = PAGE.W; c.height = PAGE.H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, PAGE.W, PAGE.H);
  return { c, ctx };
}

/** Margins for a recto (right) or verso (left) page. */
function frame(side) {
  const W = PAGE.W, H = PAGE.H;
  const inner = W / 9, outer = (2 * W) / 9, top = H / 9, bottom = (2 * H) / 9;
  const left = side === 'verso' ? outer : inner;
  const right = side === 'verso' ? W - inner : W - outer;
  return { left, right, top, bottom: H - bottom, w: right - left, W, H, inner, outer };
}

function furniture(ctx, f, side, folio, head) {
  // running head and folio, set small in mono
  const y = f.top - 70;
  const xOut = side === 'verso' ? f.left : f.right;
  const align = side === 'verso' ? 'left' : 'right';
  text(ctx, head.toUpperCase(), xOut, y, { font: F.mono(22), color: SOFT, spacing: '3px', align });
  text(ctx, String(folio), xOut, f.H - f.H / 9 + 40, { font: F.text(30, true), color: SOFT, align });
}

/* ---------------------------------------------------------------- */

export async function buildPages() {
  const load = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = src; });
  const [press, cover, spine] = await Promise.all([load('/img/press.jpg'), load('/img/cover.jpg'), load('/img/spine.jpg')]);

  const pages = [];

  /* Spread 1 · The House */
  {
    const { c, ctx } = blank(); const f = frame('verso');
    furniture(ctx, f, 'verso', 12, 'Sirius · The House');
    text(ctx, '№ 01', f.left, f.top + 40, { font: F.mono(26), color: CINNABAR, spacing: '4px' });
    let y = f.top + 210;
    text(ctx, 'We publish', f.left - 8, y, { font: F.display(150) });
    text(ctx, 'slowly.', f.left - 8, y + 150, { font: F.display(150, true) });
    y += 300;
    rule(ctx, f.left, y, 160, CINNABAR, 0.9, 3);
    y += 120;
    // drop cap
    text(ctx, 'S', f.left - 6, y + 92, { font: F.display(232) });
    para(ctx, 'irius began in 1987 in a former bindery on Lantern Row, with one hand-fed press and a conviction that some books should take longer to make than to read.',
      f.left, y, f.w, { font: F.text(40), lh: 62, dropLines: 3, dropW: 150 });
    y += 62 * 6 + 40;
    para(ctx, 'We still believe it.', f.left, y, f.w, { font: F.text(40, true), lh: 62 });
    pages.push(c);
  }
  {
    const { c, ctx } = blank(); const f = frame('recto');
    furniture(ctx, f, 'recto', 13, 'Est. 1987');
    // the photo bleeds off the outer edge
    const ph = 1040;
    duotone(ctx, press, f.left, f.top, f.W - f.left, ph, { fx: 0.4, fy: 0.5, contrast: 1.2 });
    let y = f.top + ph + 90;
    text(ctx, 'FIG. 1', f.left, y, { font: F.mono(22), color: CINNABAR, spacing: '3px' });
    para(ctx, 'The Heidelberg platen, our oldest colleague. Still printing every colophon we make.',
      f.left + 150, y, f.w - 150, { font: F.text(36, true), lh: 54, color: INK });
    pages.push(c);
  }

  /* Spread 2 · New This Season */
  {
    const { c, ctx } = blank(); const f = frame('verso');
    furniture(ctx, f, 'verso', 46, 'New this season');
    text(ctx, '№ 02', f.left, f.top + 40, { font: F.mono(26), color: CINNABAR, spacing: '4px' });
    text(ctx, 'NEW THIS SEASON', f.left + 150, f.top + 40, { font: F.mono(22), color: SOFT, spacing: '3px' });
    let y = f.top + 200;
    for (const [i, l] of ['The Cartographer', 'of Small Rooms'].entries()) {
      text(ctx, l, f.left - 6, y + i * 128, { font: F.display(120, i === 1) });
    }
    y += 128 + 110;
    text(ctx, 'Ilse Varga', f.left, y, { font: F.text(50, true), color: INK });
    y += 60;
    rule(ctx, f.left, y + 30, f.w, INK, 0.25, 2);
    y += 140;
    y = para(ctx, 'A retired mapmaker begins charting the apartment she can no longer leave — every crack in the plaster becomes a river, every draught a prevailing wind.',
      f.left, y, f.w, { font: F.text(40), lh: 62 });
    y = para(ctx, 'A novel about the size of a life.', f.left, y + 20, f.w, { font: F.text(40, true), lh: 62 });
    text(ctx, 'NOVEL · 312 PAGES · CLOTHBOUND · OCTOBER 2026', f.left, f.bottom - 10, { font: F.mono(22), color: SOFT, spacing: '2.5px' });
    pages.push(c);
  }
  {
    const { c, ctx } = blank(); const f = frame('recto');
    furniture(ctx, f, 'recto', 47, 'Ilse Varga');
    const pw = f.w, ph = 860;
    duotone(ctx, cover, f.left, f.top, pw, ph, { fx: 0.45, fy: 0.55, contrast: 1.1, lift: 0.1 });
    let y = f.top + ph + 170;
    // hanging opening quote
    ctx.font = F.display(84, true);
    const q = ctx.measureText('“').width;
    text(ctx, '“', f.left - q, y, { font: F.display(84, true), color: CINNABAR });
    ctx.font = F.display(84, true);
    const lines = wrap(ctx, 'She measured the hallway in footsteps, then in years.”', f.w);
    lines.forEach((l, i) => text(ctx, l, f.left, y + i * 96, { font: F.display(84, true) }));
    pages.push(c);
  }

  /* Spread 3 · The Craft */
  {
    const { c, ctx } = blank(); const f = frame('verso');
    furniture(ctx, f, 'verso', 88, 'The Craft');
    text(ctx, '№ 03', f.left, f.top + 40, { font: F.mono(26), color: CINNABAR, spacing: '4px' });
    let y = f.top + 210;
    text(ctx, 'Every copy,', f.left - 8, y, { font: F.display(138) });
    text(ctx, 'made by hand.', f.left - 8, y + 140, { font: F.display(138, true) });
    y += 140 + 150;
    rule(ctx, f.left, y, 160, CINNABAR, 0.9, 3);
    y += 120;
    const items = [
      'Sewn bindings.',
      'Cotton papers from a mill in the Ardèche.',
      'Covers set in metal type.',
    ];
    for (const it of items) y = para(ctx, it, f.left, y, f.w, { font: F.text(40), lh: 62 }) + 6;
    y += 30;
    para(ctx, 'Small editions, numbered and signed, so that every book carries a trace of the people who made it.',
      f.left, y, f.w, { font: F.text(40, true), lh: 62 });
    pages.push(c);
  }
  {
    const { c, ctx } = blank(); const f = frame('recto');
    furniture(ctx, f, 'recto', 89, 'By hand');
    const ph = 640;
    duotone(ctx, spine, f.left, f.top, f.W - f.left, ph, { fx: 0.62, fy: 0.5, contrast: 1.15 });
    const nums = [['39', 'years on Lantern Row'], ['64', 'titles in print'], ['11', 'languages'], ['1,200', 'copies — our largest edition']];
    const colW = f.w / 2;
    let y0 = f.top + ph + 210;
    nums.forEach(([n, l], i) => {
      const x = f.left + (i % 2) * colW;
      const y = y0 + Math.floor(i / 2) * 300;
      text(ctx, n, x - 4, y, { font: F.display(150) });
      rule(ctx, x, y + 40, colW - 50, INK, 0.25, 2);
      ctx.font = F.mono(21);
      ctx.letterSpacing = '2px';
      wrap(ctx, l.toUpperCase(), colW - 60).forEach((ln, j) => text(ctx, ln, x, y + 92 + j * 34, { font: F.mono(21), color: SOFT, spacing: '2px' }));
    });
    pages.push(c);
  }

  return pages.map((c) => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  });
}
