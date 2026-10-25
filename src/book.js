import * as THREE from 'three';
import { GLSL_NOISE, clamp, smooth } from './util.js';
import { COLORS } from './background.js';

/*
 * An open clothbound book lying on the desk.
 * Local frame: spine along +Y at x = 0, pages spread along ±X, +Z is up off the desk.
 * Pages bend without stretching: each row is integrated from an angle profile θ(s).
 */

export const BOOK = { PW: 3.0, PH: 3.0 * (1768 / 1300), GUTTER_Z: 0.05, NS: 64, NY: 18 };

const rest = (s) => 1.05 * Math.exp(-s / 0.13) - 0.022 * (s / BOOK.PW);

/** Fill a grid geometry's positions for turn progress u (0 = lying right, 1 = lying left). */
function bend(geo, u, { lift = 0 } = {}) {
  const { PW, PH, GUTTER_Z, NS, NY } = BOOK;
  const pos = geo.attributes.position;
  const ds = PW / NS;
  for (let j = 0; j <= NY; j++) {
    const yn = j / NY; // 0 bottom → 1 top
    // the hand lifts the lower outer corner, so lower rows run slightly ahead
    const ur = clamp(u + 0.09 * (1 - yn) * Math.sin(Math.PI * u));
    let x = 0, z = GUTTER_Z;
    for (let i = 0; i <= NS; i++) {
      const s = i * ds;
      if (i > 0) {
        const sm = s - ds / 2;
        const thR = rest(sm);
        const thL = Math.PI - thR;
        const lag = 0.62;
        const a = smooth(clamp(ur * (1 + lag) - lag * (1 - sm / PW)));
        const th = thR + (thL - thR) * a;
        x += Math.cos(th) * ds;
        z += Math.sin(th) * ds;
      }
      const k = j * (NS + 1) + i;
      pos.setXYZ(k, x, (yn - 0.5) * PH, z + lift);
    }
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
}

function pageGeometry() {
  const { PW, PH, NS, NY } = BOOK;
  const g = new THREE.PlaneGeometry(PW, PH, NS, NY);
  // PlaneGeometry rows run top → bottom; we index bottom → top, so rebuild uvs to match.
  const uv = g.attributes.uv;
  for (let j = 0; j <= NY; j++) for (let i = 0; i <= NS; i++) uv.setXY(j * (NS + 1) + i, i / NS, j / NY);
  const idx = [];
  for (let j = 0; j < NY; j++) for (let i = 0; i < NS; i++) {
    const a = j * (NS + 1) + i, b = a + 1, c = a + NS + 1, d = c + 1;
    idx.push(a, b, d, a, d, c);
  }
  g.setIndex(idx);
  return g;
}

/** Page material: cloth-white paper, content soaks in through the fibres as `uReveal` rises. */
function pageMaterial(map, { flip = false } = {}) {
  const tex = flip ? map.clone() : map;
  if (flip) { tex.repeat.x = -1; tex.offset.x = 1; tex.wrapS = THREE.RepeatWrapping; tex.needsUpdate = true; }
  const uniforms = {
    uReveal: { value: 0 },
    uPaper: { value: new THREE.Color(COLORS.paper).multiplyScalar(0.985) },
    uFresh: { value: new THREE.Color(COLORS.inkFresh) },
    uSeed: { value: Math.random() * 10 },
  };
  const m = new THREE.MeshStandardMaterial({
    map: tex, roughness: 0.92, metalness: 0, side: flip ? THREE.BackSide : THREE.FrontSide,
  });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uReveal; uniform vec3 uPaper; uniform vec3 uFresh; uniform float uSeed;
        ${GLSL_NOISE}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          vec2 tuv = vMapUv;
          float vTop = 1.0 - tuv.y;
          float field = vTop * 0.55 + fbm(tuv * vec2(9.0, 13.0) + uSeed) * 0.33 + vnoise(tuv * 160.0) * 0.07;
          float m = smoothstep(0.0, 0.1, uReveal * 1.5 - field);
          float edge = m * (1.0 - m) * 4.0;
          float grain = 1.0 + (hash12(gl_FragCoord.xy) - 0.5) * 0.04 + (fbm(tuv * 30.0) - 0.5) * 0.05;
          vec3 paperCol = uPaper * grain;
          float inkiness = 1.0 - smoothstep(0.08, 0.6, dot(diffuseColor.rgb, vec3(0.333)));
          vec3 content = mix(diffuseColor.rgb * grain, uFresh, edge * inkiness * 0.85);
          diffuseColor.rgb = mix(paperCol, content, m);
        }`);
  };
  m.userData.uniforms = uniforms;
  return m;
}

function clothTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#1d2433';
  g.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y += 2) { g.fillStyle = `rgba(255,255,255,${0.02 + Math.random() * 0.025})`; g.fillRect(0, y, 512, 1); }
  for (let x = 0; x < 512; x += 2) { g.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.05})`; g.fillRect(x, 0, 1, 512); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 4);
  return t;
}

export function createBook(textures) {
  const { PW, PH } = BOOK;
  const group = new THREE.Group();

  /* cover boards */
  const coverMat = new THREE.MeshStandardMaterial({ map: clothTexture(), roughness: 0.9 });
  const cover = new THREE.Mesh(new THREE.BoxGeometry(PW * 2 + 0.24, PH + 0.2, 0.05), coverMat);
  cover.position.z = 0.0;
  cover.castShadow = true;
  cover.receiveShadow = true;
  group.add(cover);

  /* page blocks (their edges show in perspective) */
  const edgeC = document.createElement('canvas');
  edgeC.width = 8; edgeC.height = 256;
  const eg = edgeC.getContext('2d');
  for (let y = 0; y < 256; y++) { const v = 214 + Math.random() * 22; eg.fillStyle = `rgb(${v},${v - 8},${v - 22})`; eg.fillRect(0, y, 8, 1); }
  const edgeTex = new THREE.CanvasTexture(edgeC);
  edgeTex.colorSpace = THREE.SRGBColorSpace;
  const edgeMat = new THREE.MeshStandardMaterial({ map: edgeTex, roughness: 1 });
  const topMat = new THREE.MeshStandardMaterial({ color: COLORS.paper, roughness: 1 });
  const blockMats = [edgeMat, edgeMat, edgeMat, edgeMat, topMat, edgeMat];
  for (const sgn of [-1, 1]) {
    // kept just under the leaves' outer edge so only the fore-edge shows
    const b = new THREE.Mesh(new THREE.BoxGeometry(PW - 0.16, PH - 0.01, 0.09), blockMats);
    b.position.set(sgn * (PW / 2 + 0.03), 0, 0.05);
    b.castShadow = true;
    group.add(b);
  }

  /* headbands, a cinnabar-and-ivory stitch at the head and tail of the spine */
  const hbMat = new THREE.MeshStandardMaterial({ color: COLORS.cinnabar, roughness: 0.6 });
  for (const sgn of [-1, 1]) {
    const hb = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.16, 12), hbMat);
    hb.rotation.z = Math.PI / 2;
    hb.position.set(0, sgn * (PH / 2 - 0.005), 0.05);
    group.add(hb);
  }

  /* static pages */
  const mats = textures.map((t) => pageMaterial(t));
  const left = new THREE.Mesh(pageGeometry(), mats[0]);
  const right = new THREE.Mesh(pageGeometry(), mats[1]);
  // mirrored in x, so reverse the winding to keep the face up
  const li = left.geometry.index.array;
  for (let i = 0; i < li.length; i += 3) { const t = li[i + 1]; li[i + 1] = li[i + 2]; li[i + 2] = t; }
  bend(left.geometry, 1);
  bend(right.geometry, 0);
  // left page uvs run from the outer edge, so mirror them on the left mesh
  const luv = left.geometry.attributes.uv;
  for (let i = 0; i < luv.count; i++) luv.setX(i, 1 - luv.getX(i));
  left.receiveShadow = right.receiveShadow = true;
  left.castShadow = right.castShadow = true;
  group.add(left, right);

  /* the turning leaf: front shows a recto, back shows the next verso */
  const leafGeo = pageGeometry();
  const front = new THREE.Mesh(leafGeo, mats[1]);
  const backMats = textures.map((t, i) => (i % 2 === 0 ? pageMaterial(t, { flip: true }) : null));
  const back = new THREE.Mesh(leafGeo, backMats[2]);
  front.castShadow = back.castShadow = true;
  front.receiveShadow = back.receiveShadow = true;
  const leaf = new THREE.Group();
  leaf.add(front, back);
  leaf.visible = false;
  group.add(leaf);

  /** spread index s (0..2) and turn progress t between spread s and s+1 */
  let shown = { s: -1, turning: -1 };
  function setState(spread, turn) {
    // turn: null when at rest on `spread`, else 0..1 turning from `spread` to `spread+1`
    if (turn == null || turn <= 0) {
      left.material = mats[spread * 2];
      right.material = mats[spread * 2 + 1];
      leaf.visible = false;
    } else if (turn >= 1) {
      left.material = mats[(spread + 1) * 2];
      right.material = mats[(spread + 1) * 2 + 1];
      leaf.visible = false;
    } else {
      left.material = mats[spread * 2];
      right.material = mats[(spread + 1) * 2 + 1];
      front.material = mats[spread * 2 + 1];
      back.material = backMats[(spread + 1) * 2];
      bend(leafGeo, turn, { lift: 0.004 });
      leaf.visible = true;
    }
    shown = { s: spread, turning: turn };
  }

  /** reveal amount for page index (0..5) */
  function reveal(i, v) {
    mats[i].userData.uniforms.uReveal.value = v;
    if (backMats[i]) backMats[i].userData.uniforms.uReveal.value = v;
  }

  setState(0, null);

  /** Local pose of the bookmark: lying in the gutter, feather out past the head. */
  const gutterZ = BOOK.GUTTER_Z + 0.06;

  return { group, setState, reveal, gutterZ, leaf, left, right, cover };
}
