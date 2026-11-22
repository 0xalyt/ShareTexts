/** Offline only. Blender hardware + real, recorded ShareTexts clients.
 * The production app receives H.264, never this renderer or its assets. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

type Anchor = { x: number; y: number; width: number; height: number };
type Action = { actor: string; kind: string; t: number; x: number; y: number };
type NativeMetadata = {
  captureVersion: number;
  recordedAt: number;
  dimensions: Record<string, [number, number]>;
  frames: Record<string, { t: number; file: string }[]>;
  actions: Action[];
  anchors: Record<string, Anchor>;
  states: Record<string, Record<string, number>>;
};
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (t: number, start: number, duration: number) => {
  const p = clamp((t - start) / duration);
  return p * p * p * (p * (p * 6 - 15) + 10);
};

export async function createBlenderStage(canvas: HTMLCanvasElement, dark: boolean) {
  const root = `/film/out/launch-v5-${dark ? 'dark' : 'light'}`;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(1920, 1080, false); renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = dark ? 1 : 1.05;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(dark ? '#181818' : '#ffffff');
  const camera = new THREE.PerspectiveCamera(28, 16 / 9, .04, 250);
  const [gltf, hdr, metadata] = await Promise.all([
    new GLTFLoader().loadAsync(`${root}/studio.glb`),
    new RGBELoader().loadAsync('/film/out/studio_small_08_1k.hdr'),
    fetch(`${root}/native-ui.json`).then(r => { if (!r.ok) throw new Error('Native UI footage has not been captured'); return r.json() as Promise<NativeMetadata>; }),
  ]);
  if (metadata.captureVersion !== 4) throw new Error('Recapture the real UI with verified receipt checkpoints and a complete playback take');
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromEquirectangular(hdr); hdr.dispose(); pmrem.dispose();
  scene.environment = environment.texture; scene.environmentIntensity = dark ? 1.1 : 1.1;
  scene.add(gltf.scene); scene.updateMatrixWorld(true);
  const key = new THREE.DirectionalLight(0xffffff, dark ? 3.5 : 3.1);
  key.position.set(-5, 14, 8); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024); key.shadow.normalBias = .025; key.shadow.radius = 7;
  Object.assign(key.shadow.camera, { left: -15, right: 15, top: 12, bottom: -12, near: 1, far: 45 });
  scene.add(key, new THREE.HemisphereLight(dark ? 0xffffff : 0xffffff, dark ? 0x17171b : 0xbdbdc7, dark ? .7 : 1.0));
  const rim = new THREE.DirectionalLight(0xffffff, dark ? 4.5 : 1.5); rim.position.set(8, 9, -7); scene.add(rim);
  gltf.scene.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = !object.name.includes('display'); object.receiveShadow = false;
    if (dark && !/display/i.test(object.name)) {
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (material instanceof THREE.MeshStandardMaterial && material.metalness > .4) {
          material.color.lerp(new THREE.Color('#929292'), .18);
        }
      }
    }
    if (/floor|seamless/i.test(object.name)) {
      object.material = new THREE.ShadowMaterial({ opacity: dark ? .34 : .13 });
      object.castShadow = false; object.receiveShadow = true;
    }
  });
  const screens: Record<string, THREE.Mesh> = {
    phone: gltf.scene.getObjectByName('Phone_display') as THREE.Mesh,
    laptop: gltf.scene.getObjectByName('Laptop_display') as THREE.Mesh,
  };
  // Blender's exporter may preserve spaces or sanitize node names.
  for (const actor of ['phone', 'laptop']) {
    screens[actor] ||= gltf.scene.getObjectByName(actor === 'phone' ? 'Phone display' : 'Laptop display') as THREE.Mesh;
    if (!screens[actor]) throw new Error(`Missing Blender ${actor} LCD`);
  }
  const buffers = Object.fromEntries(['phone', 'laptop'].map(actor => {
    const [w, h] = metadata.dimensions[actor];
    const surface = document.createElement('canvas');
    surface.width = w * 3; surface.height = (actor === 'phone' ? 874 : h) * 3;
    const texture = new THREE.CanvasTexture(surface); texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = false; texture.minFilter = THREE.LinearMipmapLinearFilter; texture.generateMipmaps = true;
    texture.anisotropy = Math.min(2, renderer.capabilities.getMaxAnisotropy());
    screens[actor].material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, side: THREE.DoubleSide });
    return [actor, { surface, texture, last: -1, lastKey: '', images: new Map<number, HTMLImageElement>() }];
  }));
  const actionTime = (kind: string) => metadata.actions.find(a => a.kind === kind)!.t;
  const stamp = (actor: string, name: string) => {
    const value = metadata.states[actor]?.[name];
    if (!Number.isFinite(value)) throw new Error(`Missing verified ${actor}/${name} checkpoint`);
    return value;
  };
  const sourceClock = [[0, stamp('phone', 'initial')], [.8, stamp('phone', 'text-composed')],
    [1.8, stamp('phone', 'text-composed')], [2, stamp('phone', 'text-sent')],
    [4.4, actionTime('attach')], [4.9, stamp('phone', 'file-staged')],
    [5.5, stamp('phone', 'file-staged')], [5.6, stamp('phone', 'file-sent')],
    [7.6, stamp('phone', 'photo-sent')], [9.35, actionTime('attach-video')],
    [9.55, stamp('phone', 'video-staged')], [10, stamp('phone', 'video-staged')],
    [10.12, stamp('phone', 'video-sent')], [15.6, stamp('phone', 'final')]];
  const receiverClock = [[0, stamp('laptop', 'initial')], [2.74, stamp('laptop', 'initial')],
    [2.75, stamp('laptop', 'text-received')], [3.35, stamp('laptop', 'text-received')],
    [3.55, stamp('laptop', 'text-copied')], [4.39, stamp('laptop', 'text-copied')],
    [6.34, stamp('laptop', 'text-copied')], [6.35, stamp('laptop', 'file-received')],
    [6.8, stamp('laptop', 'file-received')], [7.05, stamp('laptop', 'file-downloaded')],
    [7.59, stamp('laptop', 'file-downloaded')], [7.6, stamp('laptop', 'photo-received')],
    [8.39, stamp('laptop', 'photo-received')], [8.4, stamp('laptop', 'photo-open')],
    [9.34, stamp('laptop', 'photo-open')], [9.35, stamp('laptop', 'photo-closed')],
    [10.5, stamp('laptop', 'photo-closed')], [10.84, stamp('laptop', 'video-received')],
    [11.05, stamp('laptop', 'video-received')], [11.35, stamp('laptop', 'video-playing')],
    [13.8, Math.min(actionTime('play') + 3.5, metadata.frames.laptop.at(-1)!.t)],
    [15.6, stamp('laptop', 'final')]];
  const nativeTime = (actor: string, t: number) => {
    const keys = actor === 'phone' ? sourceClock : receiverClock;
    for (let i = 1; i < keys.length; i++) {
      if (t <= keys[i][0]) {
        const p = clamp((t - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0]));
        return keys[i - 1][1] + (keys[i][1] - keys[i - 1][1]) * p;
      }
    }
    return keys.at(-1)![1];
  };
  // Snapshot capture preserves sharp native type but cannot capture video at
  // its source cadence. Re-composite the SAME transferred payload at its real
  // playback time; keep the actual browser controls and all real transfer UI.
  const payload = document.createElement('video'); payload.muted = true; payload.preload = 'auto';
  payload.src = '/film/out/fixtures/Earth%20%E2%80%94%20NASA.mp4';
  await new Promise<void>((resolve, reject) => { payload.onloadeddata = () => resolve(); payload.onerror = () => reject(new Error('Missing original video payload')); });
  const movingPicture = document.createElement('canvas');
  movingPicture.width = 1500; movingPicture.height = 846;
  const picture = movingPicture.getContext('2d')!;
  async function seekPayload(time: number) {
    const target = Math.min(payload.duration - .04, Math.max(0, time));
    if (Math.abs(payload.currentTime - target) < .002) return;
    await new Promise<void>(resolve => { payload.addEventListener('seeked', () => resolve(), { once: true }); payload.currentTime = target; });
  }
  async function paint(actor: string, time: number) {
    const frames = metadata.frames[actor];
    let index = 0;
    for (let i = 0; i < frames.length && frames[i].t <= time; i++) index = i;
    const buffer = buffers[actor];
    const videoKey = actor === 'laptop' && time > actionTime('play') + .15 ? Math.floor((time - actionTime('play')) * 30) : -1;
    const key = `${index}/${videoKey}`;
    if (buffer.lastKey === key) return;
    let image = buffer.images.get(index);
    if (!image) {
      image = new Image(); image.src = `${root}/${frames[index].file}`; await image.decode();
      if (image.naturalWidth < metadata.dimensions[actor][0] * 2) throw new Error('Macro shots require device-resolution UI captures');
      buffer.images.set(index, image);
      for (const key of buffer.images.keys()) {
        if (buffer.images.size > 3 && key !== 0 && key !== index) buffer.images.delete(key);
      }
      if (buffer.images.size > 6) buffer.images.delete(buffer.images.keys().next().value!);
    }
    const [w, h] = metadata.dimensions[actor], ctx = buffer.surface.getContext('2d')!;
    ctx.setTransform(3, 0, 0, 3, 0, 0);
    ctx.fillStyle = dark ? '#181818' : '#ffffff'; ctx.fillRect(0, 0, w, actor === 'phone' ? 874 : h);
    ctx.drawImage(image, 0, actor === 'phone' ? 50 : 0, w, h);
    if (actor === 'laptop' && time > actionTime('play') + .15) {
      await seekPayload(time - actionTime('play'));
      const a = metadata.anchors['laptop-video'], x = a.x - a.width / 2, y = a.y - a.height / 2;
      picture.globalCompositeOperation = 'source-over'; picture.clearRect(0, 0, 1500, 846);
      picture.drawImage(payload, 0, 0, 1500, 846);
      const feather = picture.createLinearGradient(0, 0, 0, 846);
      feather.addColorStop(0, '#000'); feather.addColorStop(.5, '#000'); feather.addColorStop(.78, '#0000'); feather.addColorStop(1, '#0000');
      picture.globalCompositeOperation = 'destination-in'; picture.fillStyle = feather; picture.fillRect(0, 0, 1500, 846);
      ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, a.width, a.height, [16, 16, 0, 0]); ctx.clip();
      // Feather into the genuine native control bar; no hard compositing seam.
      ctx.drawImage(movingPicture, x, y, a.width, a.height); ctx.restore();
    }
    if (actor === 'phone') {
      ctx.fillStyle = dark ? '#f5f5f7' : '#121214'; ctx.font = '600 14px sans-serif';
      ctx.fillText(new Date(metadata.recordedAt * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false }), 25, 30);
      ctx.fillRect(338, 19, 22, 10); ctx.fillRect(361, 22, 2, 4);
      for (let i = 0; i < 4; i++) ctx.fillRect(309 + i * 5, 28 - i * 2, 3, 3 + i * 2);
    }
    buffer.texture.needsUpdate = true; buffer.last = index; buffer.lastKey = key;
  }
  const sizes = { phone: [2.30, 5.00], laptop: [9.94, 6.455] };
  const pointer = document.createElement('canvas'); pointer.width = 1920; pointer.height = 1080;
  pointer.className = 'native-film-pointer'; pointer.style.cssText = 'position:absolute;inset:0;pointer-events:none';
  canvas.after(pointer);
  const cursor = pointer.getContext('2d')!;
  let activeActor: 'phone' | 'laptop' | undefined;
  function world(actor: 'phone' | 'laptop', x: number, y: number) {
    const [w, h] = sizes[actor], [pixels] = metadata.dimensions[actor];
    const height = actor === 'phone' ? 874 : metadata.dimensions[actor][1];
    return screens[actor].localToWorld(new THREE.Vector3((x / pixels - .5) * w, (.5 - y / height) * h, .008));
  }
  function aimMacro(actor: 'phone' | 'laptop', x: number, y: number, width: number, progress: number) {
    activeActor = actor;
    const target = world(actor, x + 7 * (progress - .5), y);
    const normal = new THREE.Vector3(0, 0, 1).transformDirection(screens[actor].matrixWorld);
    const right = new THREE.Vector3(1, 0, 0).transformDirection(screens[actor].matrixWorld);
    const up = new THREE.Vector3(0, 1, 0).transformDirection(screens[actor].matrixWorld);
    const field = width / metadata.dimensions[actor][0] * sizes[actor][0] * 9 / 16;
    const distance = field / (2 * Math.tan(THREE.MathUtils.degToRad(14)));
    camera.position.copy(target).addScaledVector(normal, distance)
      .addScaledVector(right, distance * (-.11 + .07 * progress)).addScaledVector(up, distance * .05);
    camera.up.copy(up); camera.lookAt(target);
  }
  function wide(progress: number, ending = false) {
    camera.up.set(0, 1, 0);
    const x = ending ? 9 - progress * 4.5 : 9.5 - progress * 1.1;
    const y = ending ? 9.3 - progress * 1.2 : 9.5 - progress * .5;
    camera.position.set(1.1 + (x - .3) * 1.28, 3 + (y - 2.55) * 1.28, -.1 + (19.6 - progress * .8) * 1.28);
    camera.lookAt(1.1, 3, -.1);
  }
  const packet = new THREE.Group();
  const tile = new THREE.Shape(), edge = .28, corner = .07;
  tile.moveTo(-edge + corner, -edge); tile.lineTo(edge - corner, -edge);
  tile.quadraticCurveTo(edge, -edge, edge, -edge + corner); tile.lineTo(edge, edge - corner);
  tile.quadraticCurveTo(edge, edge, edge - corner, edge); tile.lineTo(-edge + corner, edge);
  tile.quadraticCurveTo(-edge, edge, -edge, edge - corner); tile.lineTo(-edge, -edge + corner);
  tile.quadraticCurveTo(-edge, -edge, -edge + corner, -edge);
  const tileBody = new THREE.ExtrudeGeometry(tile, { depth: .07, bevelEnabled: true, bevelSize: .035, bevelThickness: .035, bevelSegments: 4, curveSegments: 8 });
  tileBody.translate(0, 0, -.035);
  const box = new THREE.Mesh(tileBody, new THREE.MeshStandardMaterial({ color: '#f06413', metalness: .22, roughness: .27 }));
  const symbol = document.createElement('canvas'); symbol.width = symbol.height = 128;
  const symbolContext = symbol.getContext('2d')!;
  symbolContext.strokeStyle = '#ffffff'; symbolContext.lineWidth = 7; symbolContext.lineJoin = 'round';
  symbolContext.strokeRect(32, 24, 64, 79); symbolContext.beginPath(); symbolContext.moveTo(44, 48); symbolContext.lineTo(82, 48); symbolContext.moveTo(44, 66); symbolContext.lineTo(82, 66); symbolContext.stroke();
  const mark = new THREE.CanvasTexture(symbol); mark.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(.62, .62), new THREE.MeshBasicMaterial({ map: mark, transparent: true, toneMapped: false })); face.position.z = .071;
  packet.add(box, face); scene.add(packet);
  async function seek(t: number) {
    const returning = t >= 16.0;
    const phase = returning ? 0 : t;
    await Promise.all([paint('phone', nativeTime('phone', phase)), paint('laptop', nativeTime('laptop', phase))]);
    packet.visible = false;
    activeActor = undefined;
    if (phase < .8) wide(smooth(phase, 0, .8));
    else if (phase < 2.15 || (phase >= 4.4 && phase < 5.65) || (phase >= 9.35 && phase < 10.15)) {
      const section = phase < 2.15 ? [.8, 1.35, 'text'] : phase < 5.65 ? [4.4, 1.25, 'file'] : [9.35, .8, 'video'];
      const p = smooth(phase, section[0] as number, section[1] as number);
      const a = metadata.anchors[`phone-${section[2]}`], c = metadata.anchors['phone-composer'];
      const top = Math.min(a.y - a.height / 2, c.y - c.height / 2), bottom = c.y + c.height / 2;
      aimMacro('phone', 201, section[2] === 'video' ? c.y - 70 : (top + bottom) / 2 + 50,
        section[2] === 'video' ? 590 - p * 20 : 565 - p * 38, p);
    } else if ((phase >= 2.15 && phase < 2.75) || (phase >= 5.65 && phase < 6.35) || (phase >= 10.15 && phase < 10.85)) {
      const section = phase < 2.75 ? [2.15, .6, 'text'] : phase < 6.35 ? [5.65, .7, 'file'] : [10.15, .7, 'video'];
      const p = smooth(phase, section[0] as number, section[1] as number); wide(p);
      const a = metadata.anchors[`phone-${section[2]}`], b = metadata.anchors[`laptop-${section[2]}`];
      const from = world('phone', a.x, a.y + 50), to = world('laptop', b.x, b.y);
      packet.visible = p > .02 && p < .99; packet.position.lerpVectors(from, to, p);
      packet.position.y += Math.sin(p * Math.PI) * 1.8;
      packet.quaternion.copy(camera.quaternion); packet.rotateZ(Math.sin(p * Math.PI) * -.18);
      packet.scale.setScalar(.82 + .18 * Math.sin(p * Math.PI));
    } else if (phase < 4.4) {
      const p = smooth(phase, 2.75, 1.65), a = metadata.anchors['laptop-text'];
      aimMacro('laptop', a.x, a.y - 8, 545 - p * 35, p);
    } else if (phase < 7.6) {
      const p = smooth(phase, 6.35, 1.25), a = metadata.anchors['laptop-file'];
      aimMacro('laptop', a.x, a.y, 590 - p * 30, p);
    } else if (phase < 8.4) {
      const a = metadata.anchors['laptop-photo'];
      aimMacro('laptop', a.x, a.y, Math.max(a.width + 90, (a.height + 90) * 16 / 9), .5);
    } else if (phase < 9.35) {
      aimMacro('laptop', 504, 327, 1180 - smooth(phase, 8.4, .95) * 45, .5);
    } else if (phase < 13.8) {
      const p = smooth(phase, 10.85, 2.95), a = metadata.anchors['laptop-video-card'];
      aimMacro('laptop', a.x, a.y, Math.max(a.width + 90, (a.height + 90) * 16 / 9) - p * 15, p);
    } else wide(smooth(phase, 13.8, 1.4), true);
    scene.updateMatrixWorld(true); renderer.render(scene, camera);
    // Cursor size belongs to the movie frame, never the camera's zoom level.
    cursor.clearRect(0, 0, 1920, 1080);
    if (activeActor) {
      const time = nativeTime(activeActor, phase);
      const action = metadata.actions.filter(a => a.actor === activeActor && a.t <= time).at(-1);
      const age = action ? time - action.t : 10;
      if (action && age < 1.6) {
        const point = world(activeActor, action.x, action.y + (activeActor === 'phone' ? 50 : 0)).project(camera);
        cursor.save(); cursor.translate((point.x + 1) * 960, (1 - point.y) * 540);
        cursor.globalAlpha = 1 - smooth(age, 1.2, .4);
        if (activeActor === 'phone') {
          cursor.globalAlpha *= 1 - clamp(age / .4);
          cursor.strokeStyle = '#f06413'; cursor.lineWidth = 3;
          cursor.beginPath(); cursor.arc(0, 0, 10 + age * 55, 0, Math.PI * 2); cursor.stroke();
        } else {
          cursor.scale(1.8, 1.8); cursor.beginPath(); cursor.moveTo(0, 0); cursor.lineTo(1, 19);
          cursor.lineTo(6, 14); cursor.lineTo(10, 23); cursor.lineTo(14, 21);
          cursor.lineTo(10, 12); cursor.lineTo(17, 12); cursor.closePath();
          cursor.fillStyle = '#171719'; cursor.strokeStyle = '#ffffff'; cursor.lineWidth = 2;
          cursor.stroke(); cursor.fill();
        }
        cursor.restore();
      }
    }
  }
  await seek(0);
  return { seek, dispose: () => { pointer.remove(); renderer.dispose(); environment.dispose(); } };
}
