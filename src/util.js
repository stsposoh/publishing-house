import gsap from 'gsap';

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const mix = lerp;

/** Local 0..1 progress of p inside [a, b]. */
export const seg = (p, a, b) => clamp((p - a) / (b - a));

export const ease = {
  expoOut: gsap.parseEase('expo.out'),
  expoInOut: gsap.parseEase('expo.inOut'),
  p4InOut: gsap.parseEase('power4.inOut'),
  p3InOut: gsap.parseEase('power3.inOut'),
  p2InOut: gsap.parseEase('power2.inOut'),
  p2Out: gsap.parseEase('power2.out'),
  p3Out: gsap.parseEase('power3.out'),
  p2In: gsap.parseEase('power2.in'),
  p3In: gsap.parseEase('power3.in'),
  sineInOut: gsap.parseEase('sine.inOut'),
};

export const smooth = (t) => t * t * (3 - 2 * t);

/** Deterministic pseudo-random generator (mulberry32). */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Shared GLSL helpers. */
export const GLSL_NOISE = /* glsl */ `
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * .1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x),
               mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
    return v;
  }
`;
