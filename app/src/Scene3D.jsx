import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowsOutSimple, Crosshair, DoorOpen, HouseLine, SpinnerGap } from '@phosphor-icons/react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  cameraTransitionDuration,
  createCameraOrbit,
  sampleCameraOrbit,
  smoothCameraProgress,
  surfaceProximityOpacity,
} from './domain/camera-transition.js';

const MM = 0.001;
function entityFromHit(object) {
  let current = object;
  while (current) {
    if (current.userData.entityId) return current.userData;
    current = current.parent;
  }
  return null;
}

function shapeGeometry(polygon) {
  const shape = new THREE.Shape();
  polygon.forEach((point, index) => {
    if (index === 0) shape.moveTo(point.x * MM, point.z * MM);
    else shape.lineTo(point.x * MM, point.z * MM);
  });
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

function setEntity(root, kind, id, roomId) {
  root.userData.entityKind = kind;
  root.userData.entityId = id;
  root.userData.roomId = roomId;
  return root;
}

function wallMetrics(wall) {
  const dx = wall.edge.end.x - wall.edge.start.x;
  const dz = wall.edge.end.z - wall.edge.start.z;
  const length = Math.hypot(dx, dz);
  return { dx, dz, length, ux: dx / length, uz: dz / length, rotation: -Math.atan2(dz, dx) };
}

function addWallBox(parent, wall, metrics, offset, length, bottom, height, material) {
  if (length <= 0 || height <= 0) return;
  const geometry = new THREE.BoxGeometry(length * MM, height * MM, wall.thickness * MM);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(
    (wall.edge.start.x + metrics.ux * (offset + length / 2)) * MM,
    (bottom + height / 2) * MM,
    (wall.edge.start.z + metrics.uz * (offset + length / 2)) * MM,
  );
  mesh.rotation.y = metrics.rotation;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
}

function addOpeningFrame(parent, wall, metrics, opening, materials) {
  const width = opening.width * MM;
  const height = opening.height * MM;
  const sill = opening.sillHeight * MM;
  const centerOffset = opening.offset + opening.width / 2;
  const frame = new THREE.Group();
  frame.position.set(
    (wall.edge.start.x + metrics.ux * centerOffset) * MM,
    0,
    (wall.edge.start.z + metrics.uz * centerOffset) * MM,
  );
  frame.rotation.y = metrics.rotation;
  const frameWidth = opening.kind === 'window' ? 0.045 : 0.055;
  const depth = wall.thickness * MM + 0.022;
  const pieces = [
    { size: [frameWidth, height, depth], at: [-width / 2 + frameWidth / 2, sill + height / 2, 0] },
    { size: [frameWidth, height, depth], at: [width / 2 - frameWidth / 2, sill + height / 2, 0] },
    { size: [width, frameWidth, depth], at: [0, sill + height - frameWidth / 2, 0] },
  ];
  if (opening.kind === 'window') pieces.push({ size: [width, frameWidth, depth], at: [0, sill + frameWidth / 2, 0] });
  pieces.forEach(({ size, at }) => {
    const piece = new THREE.Mesh(new THREE.BoxGeometry(...size), materials.frame);
    piece.position.set(...at);
    piece.castShadow = true;
    frame.add(piece);
  });
  if (opening.kind === 'window') {
    const glass = new THREE.Mesh(new THREE.BoxGeometry(width - frameWidth * 2, height - frameWidth * 2, 0.012), materials.glass);
    glass.position.set(0, sill + height / 2, 0);
    frame.add(glass);
  }
  parent.add(frame);
}

function buildArchitecture(world, scene, textures, entityRoots) {
  const floorMaterials = {
    'mat-floor-light-oak': new THREE.MeshStandardMaterial({ color: '#cfb38a', map: textures.oak, roughness: 0.72, side: THREE.DoubleSide }),
    'mat-floor-tile-warm': new THREE.MeshStandardMaterial({ color: '#d8d0c5', map: textures.tile, roughness: 0.64, side: THREE.DoubleSide }),
  };
  const floorGroup = new THREE.Group();
  floorGroup.name = 'Canonical floors';
  const wallsGroup = new THREE.Group();
  wallsGroup.name = 'Canonical walls';
  const wallSurfaces = [];
  world.add(floorGroup, wallsGroup);

  for (const surface of scene.surfaces.filter((candidate) => candidate.kind === 'floor')) {
    const mesh = setEntity(
      new THREE.Mesh(shapeGeometry(surface.polygon), floorMaterials[surface.materialId] ?? floorMaterials['mat-floor-light-oak']),
      'room',
      surface.roomId,
      surface.roomId,
    );
    mesh.name = surface.id;
    mesh.position.y = 0.006;
    mesh.receiveShadow = true;
    floorGroup.add(mesh);
    entityRoots.set(surface.roomId, mesh);
  }

  for (const wall of scene.surfaces.filter((candidate) => candidate.kind === 'wall')) {
    const materials = {
      wall: new THREE.MeshStandardMaterial({ color: '#f1ece3', roughness: 0.82 }),
      frame: new THREE.MeshStandardMaterial({ color: '#ddd3c5', roughness: 0.64 }),
      glass: new THREE.MeshPhysicalMaterial({ color: '#b7d1d4', roughness: 0.18, transmission: 0.44, transparent: true, opacity: 0.38, depthWrite: false, side: THREE.DoubleSide }),
    };
    for (const material of Object.values(materials)) material.userData.baseOpacity = material.opacity;
    const root = setEntity(new THREE.Group(), 'surface', wall.id, wall.roomId);
    root.name = wall.id;
    const metrics = wallMetrics(wall);
    const openings = scene.openings.filter((opening) => opening.hostSurfaceId === wall.id).sort((a, b) => a.offset - b.offset);
    let cursor = 0;
    for (const opening of openings) {
      addWallBox(root, wall, metrics, cursor, opening.offset - cursor, 0, wall.height, materials.wall);
      addWallBox(root, wall, metrics, opening.offset, opening.width, 0, opening.sillHeight, materials.wall);
      const top = opening.sillHeight + opening.height;
      addWallBox(root, wall, metrics, opening.offset, opening.width, top, wall.height - top, materials.wall);
      addOpeningFrame(root, wall, metrics, opening, materials);
      cursor = opening.offset + opening.width;
    }
    addWallBox(root, wall, metrics, cursor, metrics.length - cursor, 0, wall.height, materials.wall);
    wallsGroup.add(root);
    root.updateWorldMatrix(true, true);
    wallSurfaces.push({ bounds: new THREE.Box3().setFromObject(root), materials: Object.values(materials) });
    entityRoots.set(wall.id, root);
  }

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(42, 36),
    new THREE.ShadowMaterial({ color: '#756b5c', opacity: 0.11 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(5.5, -0.025, 4);
  ground.receiveShadow = true;
  ground.userData.skipPick = true;
  world.add(ground);
  return wallSurfaces;
}

async function loadTextures(renderer) {
  const loader = new THREE.TextureLoader();
  const [oak, tile] = await Promise.all([
    loader.loadAsync('/assets/materials/floor-oak-light.webp'),
    loader.loadAsync('/assets/materials/floor-tile-warm.webp'),
  ]);
  for (const texture of [oak, tile]) {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1.35, 1.35);
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  }
  return { oak, tile };
}

async function buildFurniture(world, scene, entityRoots) {
  const loader = new GLTFLoader();
  const cache = new Map();
  await Promise.all(scene.objects.map(async (object) => {
    if (!cache.has(object.model3D.src)) cache.set(object.model3D.src, loader.loadAsync(object.model3D.src));
    const gltf = await cache.get(object.model3D.src);
    const asset = gltf.scene.clone(true);
    asset.updateWorldMatrix(true, true);
    const canonicalMeshes = [];
    asset.traverse((child) => {
      if (child.isMesh && (child.name.startsWith('CANONICAL') || child.userData.material_role === 'canonical')) canonicalMeshes.push(child);
    });
    const sourceBounds = canonicalMeshes.reduce((bounds, mesh) => bounds.expandByObject(mesh), new THREE.Box3());
    const sourceSize = sourceBounds.getSize(new THREE.Vector3());
    const targetWidth = object.dimensions.width * MM;
    const targetDepth = object.dimensions.depth * MM;
    const uniformScale = Math.min(targetWidth / sourceSize.x, targetDepth / sourceSize.z);
    asset.scale.setScalar(uniformScale);
    asset.updateWorldMatrix(true, true);
    const scaledBounds = new THREE.Box3().setFromObject(asset);
    const scaledCenter = scaledBounds.getCenter(new THREE.Vector3());
    asset.position.x -= scaledCenter.x;
    asset.position.z -= scaledCenter.z;
    asset.position.y -= scaledBounds.min.y;

    const root = setEntity(new THREE.Group(), 'object', object.id, object.roomId);
    root.name = object.id;
    root.userData.materialId = object.materialId;
    root.userData.assetSource = object.model3D.source;
    root.position.set(object.transform.x * MM, object.transform.y * MM, object.transform.z * MM);
    root.rotation.y = -object.transform.rotationY;
    asset.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
      child.userData.sourceObjectId = object.id;
      if (child.material) child.material.envMapIntensity = 0.32;
    });
    root.add(asset);
    world.add(root);
    entityRoots.set(object.id, root);
  }));
}

function createLights(world) {
  world.add(new THREE.HemisphereLight('#fff7e9', '#756b5e', 0.5));
  const sun = new THREE.DirectionalLight('#ffe9cb', 2.25);
  sun.position.set(-4, 12, -5);
  sun.target.position.set(4.8, 0, 4.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.00015;
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 32 });
  world.add(sun, sun.target);
  const windowFill = new THREE.RectAreaLight('#fff1de', 1.05, 6.5, 3.2);
  windowFill.position.set(-0.2, 3.1, 5.4);
  windowFill.rotation.y = Math.PI / 2;
  world.add(windowFill);
  const livingFill = new THREE.PointLight('#ffe0b8', 0.18, 9, 1.5);
  livingFill.position.set(5.2, 2.5, 5.4);
  world.add(livingFill);
}

async function createController(container, scene, callbacks) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.74;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.setAttribute('aria-label', '同一 canonical scene 的三维户型');
  renderer.domElement.tabIndex = 0;
  container.append(renderer.domElement);

  const world = new THREE.Scene();
  world.background = new THREE.Color('#ded8cc');
  world.fog = new THREE.Fog('#ded8cc', 21, 36);
  const pmrem = new THREE.PMREMGenerator(renderer);
  world.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  createLights(world);

  const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 80);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.minDistance = 1.3;
  controls.maxDistance = 28;
  controls.maxPolarAngle = Math.PI * 0.485;
  controls.screenSpacePanning = true;

  const presets = new Map(scene.cameraPresets.map((preset) => [preset.id, preset]));
  const entityRoots = new Map();
  const textures = await loadTextures(renderer);
  const wallSurfaces = buildArchitecture(world, scene, textures, entityRoots);
  await buildFurniture(world, scene, entityRoots);

  const home = presets.get('camera-home-overview');
  camera.position.set(home.position.x * MM, home.position.y * MM, home.position.z * MM);
  camera.fov = home.fov;
  controls.target.set(home.target.x * MM, home.target.y * MM, home.target.z * MM);
  camera.updateProjectionMatrix();
  controls.update();

  let disposed = false;
  let transition = null;
  let selectedHelper = null;
  let activeViewId = home.id;
  let animationFrame = 0;
  let frameCount = 0;
  let statsStart = performance.now();
  let pointerStart = null;

  function updateWallOcclusion() {
    for (const surface of wallSurfaces) {
      const opacity = surfaceProximityOpacity(surface.bounds.distanceToPoint(camera.position));
      const faded = opacity < 0.999;
      for (const material of surface.materials) {
        const baseOpacity = material.userData.baseOpacity;
        material.opacity = faded ? baseOpacity * opacity : baseOpacity;
        const transparent = baseOpacity < 1 || faded;
        const depthWrite = baseOpacity === 1 && !faded;
        if (material.transparent !== transparent || material.depthWrite !== depthWrite) {
          material.transparent = transparent;
          material.depthWrite = depthWrite;
          material.needsUpdate = true;
        }
      }
    }
  }

  function setSelection(selection) {
    if (selectedHelper) {
      world.remove(selectedHelper);
      selectedHelper.geometry.dispose();
      selectedHelper.material.dispose();
      selectedHelper = null;
    }
    if (!selection) return;
    const root = entityRoots.get(selection.id);
    if (!root) return;
    const bounds = new THREE.Box3().setFromObject(root);
    if (bounds.isEmpty()) return;
    selectedHelper = new THREE.Box3Helper(bounds, '#9a3f50');
    selectedHelper.userData.skipPick = true;
    selectedHelper.renderOrder = 9;
    world.add(selectedHelper);
  }

  function switchView(viewId, requestedDuration) {
    const preset = presets.get(viewId);
    if (!preset) return false;
    activeViewId = viewId;
    callbacks.onViewEvent?.({ phase: 'started', preset });
    controls.enabled = false;
    const presetTarget = new THREE.Vector3(preset.target.x * MM, preset.target.y * MM, preset.target.z * MM);
    const targetPosition = new THREE.Vector3(preset.position.x * MM, preset.position.y * MM, preset.position.z * MM);
    const targetLookAt = presetTarget.clone();
    const subject = preset.objectId ? entityRoots.get(preset.objectId) : null;
    if (subject) {
      const subjectCenter = new THREE.Box3().setFromObject(subject).getCenter(new THREE.Vector3());
      targetPosition.add(subjectCenter.clone().sub(presetTarget));
      targetLookAt.copy(subjectCenter);
    }
    const fromQuaternion = camera.quaternion.clone();
    const toQuaternion = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(targetPosition, targetLookAt, camera.up));
    transition = {
      startedAt: performance.now(),
      duration: cameraTransitionDuration(fromQuaternion.angleTo(toQuaternion), requestedDuration),
      toPosition: targetPosition,
      toTarget: targetLookAt,
      orbit: createCameraOrbit(camera.position, controls.target, targetPosition, targetLookAt),
      fromQuaternion,
      toQuaternion,
      fromFov: camera.fov,
      toFov: preset.fov ?? camera.fov,
      preset,
    };
    return true;
  }

  function enterFreeView() {
    transition = null;
    controls.enabled = true;
    activeViewId = 'free';
    callbacks.onViewEvent?.({ phase: 'done', preset: { id: 'free', label: '自由', kind: 'free' } });
  }

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const onPointerDown = (event) => { pointerStart = { x: event.clientX, y: event.clientY }; };
  const onPointerUp = (event) => {
    if (!pointerStart) return;
    if (Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 5) {
      enterFreeView();
      return;
    }
    const bounds = renderer.domElement.getBoundingClientRect();
    pointer.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(world.children, true).find((entry) => !entry.object.userData.skipPick);
    const entity = hit ? entityFromHit(hit.object) : null;
    if (!entity) return;
    if (activeViewId === 'camera-home-overview' && entity.entityKind === 'surface' && entity.roomId) {
      const room = scene.rooms.find((candidate) => candidate.id === entity.roomId);
      if (room) {
        const selection = { kind: 'room', id: room.id };
        if (callbacks.onNavigate) callbacks.onNavigate({ selection, presetId: room.cameraPresetIds[0], reason: 'room' });
        else {
          callbacks.onSelect?.(selection);
          switchView(room.cameraPresetIds[0]);
        }
        return;
      }
    }
    if (entity.entityKind === 'room') {
      const room = scene.rooms.find((candidate) => candidate.id === entity.entityId);
      if (room) {
        const selection = { kind: 'room', id: room.id };
        if (callbacks.onNavigate) callbacks.onNavigate({ selection, presetId: room.cameraPresetIds[0], reason: 'room' });
        else {
          callbacks.onSelect?.(selection);
          switchView(room.cameraPresetIds[0]);
        }
        return;
      }
    }
    callbacks.onSelect?.({ kind: entity.entityKind, id: entity.entityId });
  };
  const onWheel = () => {
    if (!transition && activeViewId !== 'free') enterFreeView();
  };
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointerup', onPointerUp);
  renderer.domElement.addEventListener('wheel', onWheel, { passive: true });

  const resize = () => {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  const render = (now) => {
    if (disposed) return;
    animationFrame = requestAnimationFrame(render);
    if (transition) {
      const progress = Math.min(1, (now - transition.startedAt) / transition.duration);
      const eased = smoothCameraProgress(progress);
      const pose = sampleCameraOrbit(transition.orbit, eased);
      camera.position.set(pose.position.x, pose.position.y, pose.position.z);
      controls.target.set(pose.target.x, pose.target.y, pose.target.z);
      camera.fov = THREE.MathUtils.lerp(transition.fromFov, transition.toFov, eased);
      camera.updateProjectionMatrix();
      camera.quaternion.slerpQuaternions(transition.fromQuaternion, transition.toQuaternion, eased);
      if (progress === 1) {
        const completed = transition;
        transition = null;
        const damping = controls.enableDamping;
        controls.enableDamping = false;
        controls.update();
        camera.position.copy(completed.toPosition);
        controls.target.copy(completed.toTarget);
        controls.update();
        controls.enableDamping = damping;
        controls.enabled = true;
        callbacks.onViewEvent?.({ phase: 'done', preset: completed.preset });
      }
    }
    if (!transition) controls.update();
    updateWallOcclusion();
    renderer.render(world, camera);
    frameCount += 1;
    if (now - statsStart >= 1000) {
      callbacks.onStats?.({
        fps: Math.round((frameCount * 1000) / (now - statsStart)),
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        assets: scene.objects.length,
      });
      statsStart = now;
      frameCount = 0;
    }
  };
  animationFrame = requestAnimationFrame(render);
  switchView(home.id, 1);

  return {
    switchView,
    enterFreeView,
    setSelection,
    dispose() {
      disposed = true;
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      controls.dispose();
      world.traverse((object) => {
        object.geometry?.dispose?.();
        if (Array.isArray(object.material)) object.material.forEach((value) => value.dispose());
        else object.material?.dispose?.();
      });
      textures.oak.dispose();
      textures.tile.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

const viewIcon = (kind) => {
  if (kind === 'whole_home') return HouseLine;
  if (kind === 'room_entry') return DoorOpen;
  if (kind === 'surface_feature') return Crosshair;
  return ArrowsOutSimple;
};

const viewOrder = { room_overhead: 0, room_entry: 1, surface_feature: 2 };

export default function Scene3D({
  scene,
  selection,
  onSelect,
  onNavigate,
  activeRoomId,
  roomLabels,
  onStats,
  viewRequest,
  onViewEvent,
  showHomeView = true,
}) {
  const mountRef = useRef(null);
  const controllerRef = useRef(null);
  const viewRequestRef = useRef(viewRequest);
  viewRequestRef.current = viewRequest;
  const callbacksRef = useRef({ onSelect, onNavigate, onStats, onViewEvent });
  callbacksRef.current = { onSelect, onNavigate, onStats, onViewEvent };
  const [status, setStatus] = useState('loading');
  const [viewState, setViewState] = useState({ id: 'camera-home-overview', label: '整屋', phase: 'started' });
  const presets = useMemo(() => [
    showHomeView ? scene.cameraPresets.find((preset) => preset.kind === 'whole_home') : null,
    ...scene.cameraPresets
      .filter((preset) => preset.roomId === activeRoomId && !preset.objectId)
      .sort((a, b) => (viewOrder[a.kind] ?? 99) - (viewOrder[b.kind] ?? 99)),
  ].filter(Boolean), [scene, activeRoomId, showHomeView]);

  useEffect(() => {
    let cancelled = false;
    createController(mountRef.current, scene, {
      onSelect: (...args) => callbacksRef.current.onSelect?.(...args),
      onNavigate: (...args) => callbacksRef.current.onNavigate?.(...args),
      onStats: (...args) => callbacksRef.current.onStats?.(...args),
      onViewEvent: ({ phase, preset }) => {
        setViewState({ id: preset.id, label: preset.label, phase });
        callbacksRef.current.onViewEvent?.({ phase, preset });
      },
    }).then((controller) => {
      if (cancelled) controller.dispose();
      else {
        controllerRef.current = controller;
        controller.setSelection(selection);
        if (viewRequestRef.current?.id) controller.switchView(viewRequestRef.current.id);
        setStatus('ready');
      }
    }).catch((error) => {
      console.error('Gate 2 3D scene failed to initialize', error);
      if (!cancelled) setStatus('error');
    });
    return () => {
      cancelled = true;
      controllerRef.current?.dispose();
      controllerRef.current = null;
    };
  }, [scene]);

  useEffect(() => { controllerRef.current?.setSelection(selection); }, [selection]);
  useEffect(() => {
    if (viewRequest?.id) controllerRef.current?.switchView(viewRequest.id);
  }, [viewRequest]);

  const chooseView = (preset) => {
    if (onNavigate) onNavigate({ selection, presetId: preset.id, reason: 'preset' });
    else controllerRef.current?.switchView(preset.id);
  };
  const chooseFree = () => controllerRef.current?.enterFreeView();
  const activeRoom = scene.rooms.find((room) => room.id === activeRoomId);

  return <div className="scene3d-shell" data-testid="scene-3d" data-room-id={activeRoomId ?? ''} data-selected-id={selection?.id ?? ''}>
    <div className="scene3d" ref={mountRef} data-status={status} />
    <div className="scene3d__status" aria-live="polite">
      {status === 'loading' && <><SpinnerGap className="spin" size={15} /> 载入 9 件原创 GLB…</>}
      {status === 'error' && '三维场景加载失败'}
      {status === 'ready' && <><span className="live-dot" /> {viewState.phase === 'started' ? `镜头飞行中 · ${viewState.label}` : `${viewState.label} · 同一 scene`}</>}
    </div>
    <div className="scene3d__room">
      <span>{activeRoom ? roomLabels[activeRoom.id] : '整屋'}</span>
      <small>{activeRoom?.id ?? scene.id}</small>
    </div>
    {activeRoomId && <nav className="camera-dock" aria-label="三维视角" data-testid="camera-dock">
      {presets.map((preset) => {
        const Icon = viewIcon(preset.kind);
        return <button key={preset.id} type="button" data-preset-id={preset.id} aria-pressed={viewState.id === preset.id} onClick={() => chooseView(preset)}><Icon size={16} /><span>{preset.label}</span></button>;
      })}
      <button type="button" aria-pressed={viewState.id === 'free'} onClick={chooseFree}><ArrowsOutSimple size={16} /><span>自由</span></button>
    </nav>}
    <p className="scene3d__hint">{activeRoomId ? '切换俯视、入口或主功能面；拖动旋转，滚轮缩放。' : '点击房间地面，镜头会先飞到该房间的三维俯视。'}</p>
  </div>;
}
