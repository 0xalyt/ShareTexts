/** Dev-only, original unbranded hardware. film.html is not a production entry.
 * No remote models, HDRIs, manufacturer artwork or reference frames. */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const ROOT = '/film/out/launch-v2';
const ease = (t: number, start: number, duration: number) => {
  const p = THREE.MathUtils.clamp((t - start) / duration, 0, 1);
  return p * p * p * (p * (p * 6 - 15) + 10);
};
type TextureMeta = Record<string, { u: number; v: number }>;

function outline(w: number, h: number, radius: number) {
  const x = -w / 2, y = -h / 2, r = Math.min(radius, w / 2, h / 2);
  const shape = new THREE.Shape();
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y); shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r); shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h); shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r); shape.quadraticCurveTo(x, y, x + r, y);
  return shape;
}
function plate(w: number, h: number, r: number, depth: number, material: THREE.Material, bevel = 0.015) {
  const geometry = new THREE.ExtrudeGeometry(outline(w - bevel * 2, h - bevel * 2, r - bevel), {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel,
    bevelSegments: 8, steps: 1, curveSegments: 36,
  });
  geometry.translate(0, 0, -depth / 2);
  const mesh = new THREE.Mesh(geometry, material); mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}
function display(w: number, h: number, radius: number, texture: THREE.Texture) {
  const geometry = new THREE.ShapeGeometry(outline(w, h, radius), 24);
  const positions = geometry.attributes.position, uv = geometry.attributes.uv;
  for (let i = 0; i < positions.count; i++) uv.setXY(i, positions.getX(i) / w + 0.5, positions.getY(i) / h + 0.5);
  return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
}
function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  draw(canvas.getContext('2d')!);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}
function keyboard() {
  return canvasTexture(1680, 640, ctx => {
    ctx.fillStyle = '#373739'; ctx.beginPath(); ctx.roundRect(0, 0, 1680, 640, 32); ctx.fill();
    const rows = ['esc 1 2 3 4 5 6 7 8 9 0 − = ⌫', '⇥ Q W E R T Y U I O P [ ]', '⇪ A S D F G H J K L ; ↵', '⇧ Z X C V B N M , . / ⇧', 'fn ⌃ ⌥ ⌘ space ⌘ ⌥ ◀ ▲ ▼ ▶'];
    rows.forEach((row, y) => {
      const labels = row.split(' '), widths = labels.map(label => label === 'space' ? 5.4 : label === '⇧' ? 1.65 : 1);
      const unit = (1640 - (labels.length - 1) * 11) / widths.reduce((a, b) => a + b, 0);
      let x = 20;
      labels.forEach((label, index) => {
        const width = widths[index] * unit;
        ctx.fillStyle = '#09090a'; ctx.beginPath(); ctx.roundRect(x, 17 + y * 123, width, 109, 12); ctx.fill();
        const gradient = ctx.createLinearGradient(0, 17 + y * 123, 0, 126 + y * 123);
        gradient.addColorStop(0, '#303033'); gradient.addColorStop(1, '#171719');
        ctx.fillStyle = gradient; ctx.beginPath(); ctx.roundRect(x + 2, 19 + y * 123, width - 4, 101, 10); ctx.fill();
        ctx.fillStyle = '#d7d7dc'; ctx.font = '22px sans-serif'; ctx.textAlign = 'center';
        if (label !== 'space') ctx.fillText(label, x + width / 2, 80 + y * 123);
        x += width + 11;
      });
    });
  });
}

export async function createStudio(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
  renderer.setSize(1920, 1080, false); renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.VSMShadowMap;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#ffffff');
  const room = new RoomEnvironment(), pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(room, 0.04); scene.environment = environment.texture;
  room.dispose(); pmrem.dispose();
  const camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.1, 200);
  const key = new THREE.DirectionalLight(0xffffff, 3.2); key.position.set(-3, 18, 8); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15, near: 1, far: 50 });
  key.shadow.normalBias = 0.035; key.shadow.bias = -0.00015;
  key.shadow.radius = 7; key.shadow.blurSamples = 16;
  scene.add(key, new THREE.HemisphereLight(0xffffff, 0xc9c9d0, 1.7));
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ opacity: 0.09 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const loader = new THREE.TextureLoader();
  const names = ['phone-sending', 'phone-complete', 'laptop-empty', 'laptop-complete'];
  const textures = await Promise.all(names.map(name => loader.loadAsync(`${ROOT}/screen-${name}.png`)));
  textures.forEach(texture => { texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = renderer.capabilities.getMaxAnisotropy(); });
  const meta: TextureMeta = await fetch(`${ROOT}/textures.json`).then(response => {
    if (!response.ok) throw new Error('Generate display textures with scripts/render-launch-film.mjs first');
    return response.json();
  });
  const silver = new THREE.MeshStandardMaterial({ color: '#a9aaae', metalness: 0.96, roughness: 0.27 });
  const rim = new THREE.MeshStandardMaterial({ color: '#44454b', metalness: 1, roughness: 0.2 });
  const black = new THREE.MeshPhysicalMaterial({ color: '#08090b', roughness: 0.16, metalness: 0.2, clearcoat: 1 });

  // A 71.45×149.61 mm reference envelope, in one coordinate system. Its
  // 66.57×144.79 mm active area stays distinct from the body and glass.
  const phone = new THREE.Group(); scene.add(phone);
  phone.add(plate(3, 3 * 149.61 / 71.45, 0.47, 0.28, silver, 0.035));
  const phoneGlass = plate(2.94, 6.22, 0.445, 0.035, black, 0.012); phoneGlass.position.z = 0.169; phone.add(phoneGlass);
  const phoneW = 3 * 66.57 / 71.45, phoneH = 3 * 144.79 / 71.45;
  const phoneDisplay = display(phoneW, phoneH, 0.407, textures[0]); phoneDisplay.position.z = 0.201; phone.add(phoneDisplay);
  const island = plate(0.871, 0.255, 0.126, 0.008, black, 0.003); island.position.set(0, 2.814, 0.209); phone.add(island);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.053, 32), new THREE.MeshPhysicalMaterial({ color: '#182130', roughness: 0.08, metalness: 0.8 }));
  lens.position.set(0.29, 2.814, 0.221); phone.add(lens);
  const home = plate(0.98, 0.032, 0.016, 0.001, black, 0.001); home.position.set(0, -2.92, 0.208); phone.add(home);
  for (const [x, y, height] of [[-1.51, 1.96, 0.28], [-1.51, 1.32, 0.54], [-1.51, 0.55, 0.54], [1.51, 1.2, 0.83]]) {
    const button = plate(0.072, height, 0.035, 0.105, rim, 0.006); button.position.set(x, y, 0); phone.add(button);
  }
  for (const y of [-2.62, 2.56]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(3.006, 0.035, 0.20), new THREE.MeshStandardMaterial({ color: '#e1e0dd', roughness: 0.6 }));
    band.position.y = y; phone.add(band);
  }

  const laptop = new THREE.Group(); laptop.position.set(3.2, 0.04, -0.6); laptop.rotation.y = -0.12; scene.add(laptop);
  const base = plate(9.5, 6.05, 0.25, 0.13, silver, 0.035); base.rotation.x = -Math.PI / 2; base.position.set(0, 0.12, 0.6); laptop.add(base);
  const keysTexture = keyboard(), keys = display(8.38, 3.03, 0.12, keysTexture);
  keys.rotation.x = -Math.PI / 2; keys.position.set(0, 0.222, -0.40); laptop.add(keys);
  const trackpad = plate(3.65, 1.79, 0.12, 0.004, rim, 0.003); trackpad.rotation.x = -Math.PI / 2; trackpad.position.set(0, 0.218, 2.13); laptop.add(trackpad);
  const trackpadFace = plate(3.61, 1.75, 0.11, 0.004, silver, 0.002); trackpadFace.rotation.x = -Math.PI / 2; trackpadFace.position.set(0, 0.224, 2.13); laptop.add(trackpadFace);
  const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 8.4, 24), rim); hinge.rotation.z = Math.PI / 2; hinge.position.set(0, 0.23, -2.32); laptop.add(hinge);
  const lid = new THREE.Group(); lid.position.set(0, 0.24, -2.34); lid.rotation.x = -0.14; laptop.add(lid);
  const lidShell = plate(9.35, 6.16, 0.25, 0.12, silver, 0.025); lidShell.position.y = 3.08; lid.add(lidShell);
  const bezel = plate(9.20, 6.01, 0.225, 0.015, black, 0.008); bezel.position.set(0, 3.09, 0.081); lid.add(bezel);
  const laptopW = 8.93, laptopH = 8.93 * 982 / 1512;
  const laptopDisplay = display(laptopW, laptopH, 0.16, textures[2]); laptopDisplay.position.set(0, 3.09, 0.104); lid.add(laptopDisplay);
  const webcam = new THREE.Mesh(new THREE.CircleGeometry(0.024, 24), black); webcam.position.set(0, 6.06, 0.105); lid.add(webcam);

  const packet = new THREE.Group(); scene.add(packet);
  packet.add(plate(0.91, 1.1, 0.13, 0.14, new THREE.MeshStandardMaterial({ color: '#e34f00', metalness: 0.05, roughness: 0.35, envMapIntensity: 0.45 }), 0.025));
  const icon = canvasTexture(256, 320, ctx => {
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 12; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(160, 30); ctx.lineTo(58, 30); ctx.lineTo(58, 286); ctx.lineTo(216, 286); ctx.lineTo(216, 89); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(160, 30); ctx.lineTo(160, 89); ctx.lineTo(216, 89); ctx.moveTo(91, 155); ctx.lineTo(181, 155); ctx.moveTo(91, 197); ctx.lineTo(181, 197); ctx.stroke();
  });
  const glyph = new THREE.Mesh(new THREE.PlaneGeometry(0.49, 0.61), new THREE.MeshBasicMaterial({ map: icon, transparent: true, toneMapped: false }));
  glyph.position.z = 0.101; packet.add(glyph);
  const from = new THREE.Vector3(), to = new THREE.Vector3(), target = new THREE.Vector3();
  const macroCamera = new THREE.Vector3(0.1, 6.8, 10.8), wideCamera = new THREE.Vector3(8.5, 7.8, 22.5);
  const macroTarget = new THREE.Vector3(-4.1, 3.95, 1), wideTarget = new THREE.Vector3(0.5, 2.6, 0.1);
  const seek = (time: number) => {
    // The type/brand plate fully occludes the studio. Do not spend GPU time
    // drawing an invisible world; the composite remains a pure function of t.
    if (time >= 6.1 && time <= 11.9) return;
    // Finish on the identical opening pose, not a blank white loop frame.
    const t = time >= 11.5 ? 0 : time;
    const reveal = ease(t, 1.25, 2.1), settle = ease(t, 4.1, 1.15);
    phone.position.set(-4.55, 3.34, 1.05);
    phone.rotation.set(-0.035, THREE.MathUtils.lerp(-0.31, -0.13, reveal), THREE.MathUtils.lerp(-0.07, -0.025, reveal));
    phone.position.y += 0.14 * Math.sin(ease(t, 0, 5.55) * Math.PI);
    camera.position.lerpVectors(macroCamera, wideCamera, reveal); camera.position.x -= 0.35 * settle;
    target.lerpVectors(macroTarget, wideTarget, reveal); camera.lookAt(target);
    camera.fov = THREE.MathUtils.lerp(32, 31, reveal); camera.updateProjectionMatrix();
    phoneDisplay.material.map = textures[t >= 3.72 ? 1 : 0]; laptopDisplay.material.map = textures[t >= 3.72 ? 3 : 2];
    scene.updateMatrixWorld(true);
    const source = meta['phone-sending'], destination = meta['laptop-complete'];
    from.set((source.u - 0.5) * phoneW, (source.v - 0.5) * phoneH, 0.22); phone.localToWorld(from);
    to.set((destination.u - 0.5) * laptopW, 3.09 + (destination.v - 0.5) * laptopH, 0.14); lid.localToWorld(to);
    const flight = ease(t, 1.87, 1.85);
    packet.position.lerpVectors(from, to, flight); packet.position.y += Math.sin(flight * Math.PI) * 1.5; packet.position.z += Math.sin(flight * Math.PI) * 3.0;
    packet.rotation.set(-0.06 * Math.sin(flight * Math.PI), THREE.MathUtils.lerp(-0.31, -0.12, flight) + 0.35 * Math.sin(flight * Math.PI), THREE.MathUtils.lerp(-0.1, 0, flight));
    const bloom = ease(t, 1.75, 0.42), land = ease(t, 3.49, 0.23);
    packet.scale.setScalar(THREE.MathUtils.lerp(0.34, 1.35, bloom) * THREE.MathUtils.lerp(1, 0.25, land));
    packet.visible = t >= 1.75 && t < 3.72;
    renderer.render(scene, camera);
  };
  const dispose = () => {
    scene.traverse(object => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
      }
    });
    for (const texture of [...textures, keysTexture, icon]) texture.dispose();
    environment.dispose(); renderer.dispose();
  };
  return { seek, dispose };
}
