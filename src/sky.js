import * as THREE from 'three';

/** A star sprite: soft core, faint halo and four thin diffraction spikes. */
function starTexture() {
  const S = 512, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const cx = S / 2;
  const halo = g.createRadialGradient(cx, cx, 0, cx, cx, cx);
  halo.addColorStop(0, 'rgba(255,255,255,1)');
  halo.addColorStop(0.04, 'rgba(240,246,255,0.95)');
  halo.addColorStop(0.12, 'rgba(190,210,245,0.35)');
  halo.addColorStop(0.35, 'rgba(140,165,220,0.08)');
  halo.addColorStop(1, 'rgba(120,150,210,0)');
  g.fillStyle = halo;
  g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'lighter';
  for (const [w, len, a] of [[3, 0.5, 0], [3, 0.5, Math.PI / 2], [1.5, 0.28, Math.PI / 4], [1.5, 0.28, -Math.PI / 4]]) {
    g.save();
    g.translate(cx, cx);
    g.rotate(a);
    const grad = g.createLinearGradient(-S * len, 0, S * len, 0);
    grad.addColorStop(0, 'rgba(200,220,255,0)');
    grad.addColorStop(0.5, 'rgba(235,242,255,0.9)');
    grad.addColorStop(1, 'rgba(200,220,255,0)');
    g.fillStyle = grad;
    g.fillRect(-S * len, -w / 2, S * len * 2, w);
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createSky(stage) {
  const { camera, view, pxLen } = stage;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: starTexture(), blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true,
  }));
  sprite.renderOrder = 50;
  sprite.visible = false;

  const _v = new THREE.Vector3();
  /** Place the glow at a world point with a size in CSS px (constant on screen). */
  function place(world, px, opacity) {
    sprite.position.copy(world);
    const dist = _v.copy(world).sub(camera.position).length();
    const s = pxLen(px) * (dist / camera.position.z);
    sprite.scale.set(s, s, 1);
    sprite.material.opacity = opacity;
    sprite.material.rotation = 0.12;
    sprite.visible = opacity > 0.001 && px > 0.5;
  }

  /** World point at `depth` along the camera ray through CSS px (x, y). */
  function rayPoint(x, y, depth, out = new THREE.Vector3()) {
    out.set((x / view.w) * 2 - 1, -(y / view.h) * 2 + 1, 0.5).unproject(camera);
    out.sub(camera.position).normalize();
    return out.multiplyScalar(depth).add(camera.position);
  }

  return { sprite, place, rayPoint };
}
