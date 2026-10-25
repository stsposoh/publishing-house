import * as THREE from 'three';
import { GLSL_NOISE } from './util.js';

/** Hex → raw sRGB vec3 (our ShaderMaterials write sRGB directly). */
export const srgb = (hex) => new THREE.Vector3(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);

export const COLORS = {
  paper: 0xeee6d6,
  ink: 0x231c17,
  inkFresh: 0x1e2a4a,
  night: 0x0d1320,
  star: 0xe4ecf5,
  cinnabar: 0xc23b22,
};

/**
 * Full-screen paper that ink can flood (scene 5) and drain from (scene 7).
 * Everything is in CSS pixels so the texture reads the same at any DPR.
 */
export function createBackground() {
  const uniforms = {
    uRes: { value: new THREE.Vector2(1, 1) },
    uDpr: { value: 1 },
    uTime: { value: 0 },
    uPaper: { value: srgb(COLORS.paper) },
    uNight: { value: srgb(COLORS.night) },
    uFloodOrigin: { value: new THREE.Vector2(0, 0) },
    uFloodR: { value: 0 },
    uDrain: { value: 0 },
    uStars: { value: 0 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    depthWrite: false,
    depthTest: false,
    vertexShader: /* glsl */ `
      void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform vec2 uRes; uniform float uDpr; uniform float uTime;
      uniform vec3 uPaper; uniform vec3 uNight;
      uniform vec2 uFloodOrigin; uniform float uFloodR; uniform float uDrain; uniform float uStars;
      ${GLSL_NOISE}

      vec3 paper(vec2 px) {
        float grain = hash12(gl_FragCoord.xy) - 0.5;
        float mottle = fbm(px * 0.0045) - 0.5;
        float cloud = fbm(px * 0.018 + 3.0) - 0.5;
        // laid lines (dense, horizontal) and chain lines (sparse, vertical)
        float laid = sin(px.y * 1.25) * 0.5 + 0.5;
        laid *= smoothstep(0.35, 0.75, vnoise(px * vec2(0.004, 0.08)));
        float chain = 1.0 - smoothstep(0.0, 2.2, abs(mod(px.x + 40.0, 132.0) - 66.0));
        vec3 c = uPaper;
        c *= 1.0 + grain * 0.035 + mottle * 0.05 + cloud * 0.022 - laid * 0.012 - chain * 0.014;
        // occasional cotton fibres
        float fib = smoothstep(0.985, 1.0, vnoise(vec2(px.x * 0.9 + px.y * 0.35, px.y * 0.06 - px.x * 0.02)));
        c *= 1.0 - fib * 0.05;
        vec2 q = px / uRes * uDpr - 0.5;
        c *= 1.0 - dot(q, q) * 0.06;
        return c;
      }

      vec3 night(vec2 px) {
        float m = fbm(px * 0.0022 + 11.0);
        vec3 c = uNight * (0.82 + m * 0.4);
        c = mix(c, vec3(0.085, 0.075, 0.07), smoothstep(0.55, 0.8, fbm(px * 0.0012 + 4.0)) * 0.35);
        // a faint river of stars, as if the ink were thinner there
        vec2 r = vec2(px.x * 0.7 + px.y * 0.7, -px.x * 0.7 + px.y * 0.7);
        float band = exp(-pow((r.y - uRes.y / uDpr * 0.15) / 260.0, 2.0)) * fbm(r * 0.006);
        c += vec3(0.05, 0.06, 0.08) * band * uStars;
        // star field
        float s = 0.0;
        for (int i = 0; i < 2; i++) {
          float scale = i == 0 ? 26.0 : 61.0;
          vec2 cell = floor(px / scale);
          vec2 f = fract(px / scale) - 0.5;
          float h = hash12(cell + float(i) * 37.0);
          vec2 o = vec2(hash12(cell + 7.0), hash12(cell + 13.0)) - 0.5;
          float d = length(f - o * 0.7) * scale;
          float on = step(i == 0 ? 0.93 : 0.82, h);
          float tw = 0.6 + 0.4 * sin(uTime * (1.0 + h * 3.0) + h * 40.0);
          float size = i == 0 ? 0.7 : 1.1;
          s += on * tw * smoothstep(size + 0.9, 0.0, d) * (0.5 + h * 0.6);
        }
        c += vec3(0.82, 0.87, 0.95) * s * uStars;
        return c;
      }

      void main() {
        vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr; // css px, y down
        vec3 col = paper(px);

        // --- ink flood: a drop spreading through cotton fibres
        float d = distance(px, uFloodOrigin);
        float n = fbm(px * 0.0055) * 0.72 + fbm(px * 0.028 + 5.0) * 0.2 + vnoise(vec2(px.x * 0.16, px.y * 0.03)) * 0.08;
        float amp = min(uFloodR * 0.3, 150.0);
        float edge = uFloodR - d + (n - 0.5) * 2.0 * amp;
        float flood = smoothstep(-1.2, 1.2, edge) * step(0.5, uFloodR);
        float halo = smoothstep(-34.0, 0.0, edge) * (1.0 - flood) * step(0.5, uFloodR);

        // --- drain: the sky runs off downward, leaving thin trails behind
        float H = uRes.y / uDpr;
        float wave = vnoise(vec2(px.x * 0.004, 2.0)) * 60.0 + vnoise(vec2(px.x * 0.018, 5.0)) * 16.0;
        // a few narrow tongues of ink cling on as the sheet of night slides down
        float tongue = pow(vnoise(vec2(px.x * 0.03, 3.0)), 10.0) * 300.0;
        float front = uDrain * (H + 700.0) - wave - tongue;
        float back = smoothstep(front + 1.2, front - 1.2, px.y);
        float pool = smoothstep(10.0, 0.0, abs(px.y - front)) * (1.0 - back);

        float ink = flood * (1.0 - back);
        vec3 nightCol = night(px);
        // leading edge pools darker; wet halo tints the paper ahead of it
        nightCol *= 1.0 - smoothstep(16.0, 0.0, edge) * 0.35;
        col = mix(col, col * vec3(0.78, 0.8, 0.86), halo * 0.45 * vnoise(px * 0.08));
        col = mix(col, nightCol * (1.0 - pool * 0.4), ink);
        // the paper keeps a ghost of where the ink has been
        col *= 1.0 - back * flood * 0.035 * fbm(px * 0.01);

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -100;

  return { mesh, uniforms };
}
