// Lazy Three adapter for the approved native scene payload. No editor/GLTF dependencies.
import {
  AmbientLight, AnimationClip, AnimationMixer, BufferAttribute, BufferGeometry, Color,
  DirectionalLight, DoubleSide, Group, HemisphereLight, Mesh,
  MeshStandardMaterial, OrthographicCamera, PCFSoftShadowMap,
  QuaternionKeyframeTrack, RepeatWrapping, Scene, SRGBColorSpace,
  TextureLoader, VectorKeyframeTrack, WebGLRenderer, ACESFilmicToneMapping,
} from 'three';

function decode(text, Type = Float32Array) {
  const raw = atob(text);
  const bytes = Uint8Array.from(raw, character => character.charCodeAt(0));
  return new Type(bytes.buffer);
}

export async function loadRoomletScene(url, signal) {
  if (typeof DecompressionStream === 'undefined') throw new Error('SCENE_DECODER_UNAVAILABLE');
  const response = await fetch(url, { signal, cache: 'force-cache' });
  if (!response.ok) throw new Error('SCENE_LOAD_FAILED');
  const blob = await response.blob();
  signal.throwIfAborted();
  const data = await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).json();
  signal.throwIfAborted();
  if (!data.nodes?.length || !data.geometries?.length || !data.motion?.duration) throw new Error('SCENE_INVALID');
  return data;
}

export async function createRoomletRuntime(canvas, data, { sceneName, signal, onError }) {
  const geometries = [], materials = [], textures = [];
  let renderer, mixer, observer, frame = 0, active = false, disposed = false;
  let lastTime = 0, elapsed = 0, frames = 0;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    observer?.disconnect();
    mixer?.stopAllAction();
    geometries.forEach(item => item.dispose());
    materials.forEach(item => item.dispose());
    textures.forEach(item => item.dispose());
    renderer?.dispose();
    renderer?.forceContextLoss();
  };
  try {
    const textureLoader = new TextureLoader();
    await Promise.all(data.textures.map(async (item, index) => {
      const texture = await textureLoader.loadAsync(item.data);
      texture.colorSpace = SRGBColorSpace;
      texture.wrapS = texture.wrapT = RepeatWrapping;
      texture.flipY = false;
      textures[index] = texture;
    }));
    signal.throwIfAborted();
    renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.94;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    const world = new Scene();
    const camera = new OrthographicCamera(-4, 4, 4, -4, 0.1, 60);
    const cameraSpec = data.meta.fixedCamera;
    const [tx, ty, tz] = cameraSpec.target;
    const [x, y, z] = cameraSpec.position;
    const pitch = Math.atan2(y - ty, Math.hypot(x - tx, z - tz));
    // The living source predates the approved homepage camera-only left shift.
    const baseYaw = Math.atan2(x - tx, z - tz) - (sceneName === 'living' ? 0.18 : 0);
    const aimCamera = () => {
      const yaw = baseYaw + Math.PI / 90 * Math.cos(elapsed / data.motion.duration * Math.PI * 2);
      camera.position.set(tx + 18 * Math.sin(yaw) * Math.cos(pitch), ty + 18 * Math.sin(pitch), tz + 18 * Math.cos(yaw) * Math.cos(pitch));
      camera.lookAt(tx, ty, tz);
    };
    world.add(new HemisphereLight(0xe1e5dd, 0xb0b5a6, 1.5));
    world.add(new AmbientLight(0xe2e3dc, 0.55));
    const key = new DirectionalLight(0xffebd2, 2.1);
    key.position.set(-3.8, 9, 7);
    key.castShadow = true;
    key.shadow.mapSize.setScalar(window.innerWidth < 600 ? 512 : 1024);
    Object.assign(key.shadow.camera, { left: -7.3, right: 7.3, top: 7.3, bottom: -7.3, near: 0.1, far: 30 });
    key.shadow.normalBias = 0.025; key.shadow.bias = -0.0001; key.shadow.radius = 3;
    world.add(key);
    const fill = new DirectionalLight(0xd6e0d2, 0.7);
    fill.position.set(5, 4, -2); world.add(fill);
    for (const item of data.geometries) {
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(decode(item.positions), 3));
      geometry.setAttribute('normal', new BufferAttribute(decode(item.normals), 3));
      geometry.setAttribute('uv', new BufferAttribute(decode(item.uvs), 2));
      geometry.setIndex(new BufferAttribute(decode(item.indices, Uint32Array), 1));
      geometry.computeBoundingSphere(); geometries.push(geometry);
    }
    for (const item of data.materials) materials.push(new MeshStandardMaterial({
      name: item.name, color: new Color().setRGB(...item.color, SRGBColorSpace),
      roughness: item.roughness, metalness: item.metalness,
      map: item.texture >= 0 ? textures[item.texture] : null, side: DoubleSide,
    }));
    const nodes = data.nodes.map(item => {
      const object = item.geometry === undefined ? new Group() : new Mesh(geometries[item.geometry], materials[item.material]);
      object.name = item.name;
      object.position.fromArray(item.position); object.quaternion.fromArray(item.rotation); object.scale.fromArray(item.scale);
      if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; }
      return object;
    });
    data.nodes.forEach((item, index) => item.children.forEach(child => nodes[index].add(nodes[child])));
    const root = nodes[data.root]; world.add(root);
    const times = decode(data.motion.times);
    const tracks = data.motion.tracks.flatMap(track => [
      new VectorKeyframeTrack(`${track.name}.position`, times, decode(track.positions)),
      new QuaternionKeyframeTrack(`${track.name}.quaternion`, times, decode(track.rotations)),
    ]);
    mixer = new AnimationMixer(root);
    mixer.clipAction(new AnimationClip('ApprovedLayoutLoop', data.motion.duration, tracks)).play();
    mixer.setTime(0);
    const render = () => {
      aimCamera(); renderer.render(world, camera);
      canvas.dataset.frame = String(++frames); canvas.dataset.time = elapsed.toFixed(2);
    };
    const resize = () => {
      const width = Math.max(1, canvas.clientWidth), height = Math.max(1, canvas.clientHeight);
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5, 960 / Math.max(width, height));
      renderer.setPixelRatio(ratio); renderer.setSize(width, height, false);
      const aspect = width / height, worldHeight = Math.max(cameraSpec.height, cameraSpec.minWidth / aspect);
      camera.left = -worldHeight * aspect / 2; camera.right = -camera.left;
      camera.top = worldHeight / 2; camera.bottom = -camera.top;
      camera.updateProjectionMatrix(); render();
    };
    const tick = now => {
      if (!active || disposed) return;
      frame = requestAnimationFrame(tick);
      if (!lastTime) { lastTime = now; return; }
      const delta = (now - lastTime) / 1000;
      if (delta < 1 / 30) return;
      lastTime = now;
      elapsed = (elapsed + Math.min(delta, 0.1) * 1.25) % data.motion.duration;
      mixer.setTime(elapsed);
      try { render(); } catch (error) { dispose(); onError(error); }
    };
    observer = new ResizeObserver(resize); observer.observe(canvas); resize();
    return {
      setActive(value) {
        if (disposed || active === value) return;
        active = value; lastTime = 0; cancelAnimationFrame(frame);
        canvas.dataset.playing = String(value);
        if (active) frame = requestAnimationFrame(tick);
      },
      dispose,
    };
  } catch (error) { dispose(); throw error; }
}
