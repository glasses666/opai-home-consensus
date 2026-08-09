import { useEffect, useMemo, useState } from 'react';
import { Armchair, Cube, HouseLine, MapTrifold, StackSimple } from '@phosphor-icons/react';
import Scene3D from './Scene3D.jsx';
import { createDemoScene } from './domain/demo-scene.js';
import { projectScene2D } from './domain/projection.js';
import { createSceneStore, deserializeScene, serializeScene, validateScene } from './domain/scene.js';
import { parseViewState, sanitizeViewState, serializeViewState } from './domain/view-state.js';

const scene = createSceneStore(createDemoScene()).currentScene;
const projection = projectScene2D(scene);
const serialized = serializeScene(scene);
const serializedBytes = new TextEncoder().encode(serialized).length;
const roundTripMatches = serializeScene(deserializeScene(serialized)) === serialized;

const roomLabels = {
  'room-primary-bedroom': '主卧',
  'room-bathroom': '卫生间',
  'room-flex': '次卧 / 书房',
  'room-hall': '过厅',
  'room-living-dining': '开放客餐厅',
  'room-kitchen': '厨房',
  'room-entry': '玄关',
};

const roomLabelPositions = {
  'room-primary-bedroom': { x: 1900, y: 1700 },
  'room-bathroom': { x: 5200, y: 1200 },
  'room-flex': { x: 8650, y: 1700 },
  'room-hall': { x: 5200, y: 3300 },
  'room-living-dining': { x: 3850, y: 6150 },
  'room-kitchen': { x: 9300, y: 4600 },
  'room-entry': { x: 9300, y: 6900 },
};

const objectLabels = {
  'object-primary-bed': '双人床',
  'object-primary-wardrobe': '衣柜',
  'object-flex-bed': '单人床',
  'object-flex-desk': '书桌',
  'object-sofa': '沙发',
  'object-tv-console': '电视柜',
  'object-dining-table': '餐桌',
  'object-kitchen-counter': '橱柜',
  'object-shoe-cabinet': '鞋柜',
};

const entityKinds = { room: '房间', object: '家具', opening: '门窗', surface: '表面' };
const modeOptions = [
  { id: 'cad', label: 'CAD 图纸', icon: HouseLine },
  { id: 'furniture', label: '家具俯视', icon: Armchair },
  { id: 'overlay', label: 'CAD 与家具叠加', icon: StackSimple },
];

const polygonPoints = (points) => points.map((point) => `${point.x},${point.y}`).join(' ');
const polygonCenter = (points) => {
  const total = points.reduce((result, point) => ({ x: result.x + point.x, y: result.y + point.y }), { x: 0, y: 0 });
  return { x: total.x / points.length, y: total.y / points.length };
};
const polygonAreaM2 = (points) => Math.abs(points.reduce((sum, point, index) => {
  const next = points[(index + 1) % points.length];
  return sum + point.x * next.y - next.x * point.y;
}, 0)) / 2_000_000;
const formatMm = (value) => `${Math.round(value).toLocaleString()} mm`;

function selectOnKeyboard(event, selection, onSelect) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  onSelect(selection);
}

function HorizontalDimension({ y, points, labels, overall = false }) {
  return (
    <g className={`cad-dimension-set ${overall ? 'cad-dimension-set--overall' : ''}`} aria-hidden="true">
      {points.map((x) => <line key={`ext-${x}`} className="cad-extension" x1={x} y1="0" x2={x} y2={y - 30} />)}
      {points.slice(0, -1).map((x, index) => {
        const end = points[index + 1];
        return (
          <g key={`${x}-${end}`}>
            <line className="cad-dimension" x1={x} y1={y} x2={end} y2={y} />
            <line className="cad-tick" x1={x - 28} y1={y + 28} x2={x + 28} y2={y - 28} />
            {index === points.length - 2 && <line className="cad-tick" x1={end - 28} y1={y + 28} x2={end + 28} y2={y - 28} />}
            <text className="cad-dimension-label" x={(x + end) / 2} y={y - 50}>{labels[index]}</text>
          </g>
        );
      })}
    </g>
  );
}

function VerticalDimension({ x, points, labels, overall = false }) {
  return (
    <g className={`cad-dimension-set ${overall ? 'cad-dimension-set--overall' : ''}`} aria-hidden="true">
      {points.map((y) => <line key={`ext-${y}`} className="cad-extension" x1="11000" y1={y} x2={x + 30} y2={y} />)}
      {points.slice(0, -1).map((y, index) => {
        const end = points[index + 1];
        const mid = (y + end) / 2;
        return (
          <g key={`${y}-${end}`}>
            <line className="cad-dimension" x1={x} y1={y} x2={x} y2={end} />
            <line className="cad-tick" x1={x - 28} y1={y + 28} x2={x + 28} y2={y - 28} />
            {index === points.length - 2 && <line className="cad-tick" x1={x - 28} y1={end + 28} x2={x + 28} y2={end - 28} />}
            <text className="cad-dimension-label" x={x + 78} y={mid} transform={`rotate(90 ${x + 78} ${mid})`}>{labels[index]}</text>
          </g>
        );
      })}
    </g>
  );
}

function PlanDimensions() {
  return (
    <g className="cad-dimensions">
      <HorizontalDimension y={-330} points={[0, 4000, 6400, 11000]} labels={['4,000', '2,400', '4,600']} />
      <HorizontalDimension y={-650} points={[0, 11000]} labels={['11,000']} overall />
      <VerticalDimension x={11350} points={[0, 3200, 5600, 8000]} labels={['3,200', '2,400', '2,400']} />
      <VerticalDimension x={11700} points={[0, 8000]} labels={['8,000']} overall />
    </g>
  );
}

function OpeningSymbol({ opening, subtle }) {
  const dx = opening.end.x - opening.start.x;
  const dy = opening.end.y - opening.start.y;
  const length = Math.hypot(dx, dy);
  const normal = { x: (-dy / length) * 28, y: (dx / length) * 28 };

  if (opening.type === 'window') {
    return <>
      <line className="cad-opening-gap" data-subtle={subtle} x1={opening.start.x} y1={opening.start.y} x2={opening.end.x} y2={opening.end.y} />
      <line className="cad-window" x1={opening.start.x + normal.x} y1={opening.start.y + normal.y} x2={opening.end.x + normal.x} y2={opening.end.y + normal.y} />
      <line className="cad-window" x1={opening.start.x - normal.x} y1={opening.start.y - normal.y} x2={opening.end.x - normal.x} y2={opening.end.y - normal.y} />
    </>;
  }
  if (opening.type === 'shared-doorway') {
    return <>
      <line className="cad-opening-gap" data-subtle={subtle} x1={opening.start.x} y1={opening.start.y} x2={opening.end.x} y2={opening.end.y} />
      <line className="cad-threshold" x1={opening.start.x} y1={opening.start.y} x2={opening.end.x} y2={opening.end.y} />
    </>;
  }

  const hinge = opening.swing?.hinge === 'end' ? opening.end : opening.start;
  const closedEnd = opening.swing?.hinge === 'end' ? opening.start : opening.end;
  const leafDx = closedEnd.x - hinge.x;
  const leafDy = closedEnd.y - hinge.y;
  const side = opening.swing?.side ?? 1;
  const openEnd = { x: hinge.x + (-leafDy / length) * length * side, y: hinge.y + (leafDx / length) * length * side };
  return <>
    <line className="cad-opening-gap" data-subtle={subtle} x1={opening.start.x} y1={opening.start.y} x2={opening.end.x} y2={opening.end.y} />
    <line className="cad-door-leaf" x1={hinge.x} y1={hinge.y} x2={openEnd.x} y2={openEnd.y} />
    <path className="cad-door-swing" d={`M ${closedEnd.x} ${closedEnd.y} A ${length} ${length} 0 0 ${side > 0 ? 1 : 0} ${openEnd.x} ${openEnd.y}`} />
  </>;
}

function CadLayer({ selection, onSelect, showFurniture = true, showAnnotations = true, showDimensions = true, showTexture = false, subtle = false }) {
  const cad = projection.layers.cad;
  return (
    <g data-layer="cad" data-subtle={subtle}>
      {cad.rooms.map((room) => {
        const label = roomLabelPositions[room.id] ?? polygonCenter(room.polygon);
        const selected = selection?.kind === 'room' && selection.id === room.id;
        return <g key={room.id} className="selectable-group" role="button" tabIndex="0" aria-label={`选择${roomLabels[room.id] ?? room.name}`} onClick={() => onSelect({ kind: 'room', id: room.id })} onKeyDown={(event) => selectOnKeyboard(event, { kind: 'room', id: room.id }, onSelect)}>
          <polygon
            className="cad-room"
            data-selected={selected}
            data-textured={showTexture}
            points={polygonPoints(room.polygon)}
            style={showTexture ? { fill: `url(#${room.materialId === 'mat-floor-tile-warm' ? 'floor-tile' : 'floor-oak'})` } : undefined}
          />
          {showAnnotations && <>
            <text className="cad-room-label" x={label.x} y={label.y - 45}>{roomLabels[room.id] ?? room.name}</text>
            <text className="cad-room-meta" x={label.x} y={label.y + 78}>{polygonAreaM2(room.polygon).toFixed(1)} m²</text>
          </>}
        </g>;
      })}
      {cad.wallSegments.map((wall) => <g key={wall.id} className="selectable-group" role="button" tabIndex="0" aria-label="选择墙体" onClick={() => onSelect({ kind: 'surface', id: wall.id })} onKeyDown={(event) => selectOnKeyboard(event, { kind: 'surface', id: wall.id }, onSelect)}>
        <line className="cad-wall" data-selected={selection?.kind === 'surface' && selection.id === wall.id} x1={wall.start.x} y1={wall.start.y} x2={wall.end.x} y2={wall.end.y} style={{ strokeWidth: subtle ? Math.max(72, wall.thickness * 0.62) : wall.thickness }} />
      </g>)}
      {cad.openingSegments.map((opening) => <g key={opening.id} className="cad-opening selectable-group" data-selected={selection?.kind === 'opening' && selection.id === opening.id} role="button" tabIndex="0" aria-label="选择门窗" onClick={() => onSelect({ kind: 'opening', id: opening.id })} onKeyDown={(event) => selectOnKeyboard(event, { kind: 'opening', id: opening.id }, onSelect)}>
        <OpeningSymbol opening={opening} subtle={subtle} />
      </g>)}
      {showFurniture && cad.objectFootprints.map((footprint) => {
        const object = scene.objects.find((candidate) => candidate.id === footprint.sourceObjectId);
        const center = polygonCenter(footprint.polygon);
        const selected = selection?.kind === 'object' && selection.id === footprint.sourceObjectId;
        return <g key={footprint.id} className="selectable-group" role="button" tabIndex="0" aria-label={`选择${objectLabels[object.id] ?? object.name}`} onClick={() => onSelect({ kind: 'object', id: footprint.sourceObjectId })} onKeyDown={(event) => selectOnKeyboard(event, { kind: 'object', id: footprint.sourceObjectId }, onSelect)}>
          <polygon className="cad-footprint" data-selected={selected} points={polygonPoints(footprint.polygon)} />
          <text className="cad-object-label" x={center.x} y={center.y - 12}>{objectLabels[object.id] ?? object.name}</text>
          <text className="cad-object-meta" x={center.x} y={center.y + 64}>{object.dimensions.width} × {object.dimensions.depth}</text>
        </g>;
      })}
      {showDimensions && <PlanDimensions />}
      {showAnnotations && <g className="north-arrow" aria-label="北向"><text x="-430" y="420">N</text><line x1="-390" y1="620" x2="-390" y2="470" /><path d="M -390 430 L -440 510 L -390 485 L -340 510 Z" /></g>}
    </g>
  );
}

function MediaLayer({ selection, onSelect }) {
  return <g data-layer="media">
    {projection.layers.media.assets.map((asset) => {
      const object = scene.objects.find((candidate) => candidate.id === asset.sourceObjectId);
      const selected = selection?.kind === 'object' && selection.id === asset.sourceObjectId;
      const rotation = (asset.rotationY * 180) / Math.PI;
      return <g key={asset.id} className="media-object selectable-group" role="button" tabIndex="0" aria-label={`选择${objectLabels[object.id] ?? object.name}`} onClick={() => onSelect({ kind: 'object', id: asset.sourceObjectId })} onKeyDown={(event) => selectOnKeyboard(event, { kind: 'object', id: asset.sourceObjectId }, onSelect)}>
        <polygon className="media-hitbox" points={polygonPoints(asset.polygon)} />
        <image className="media-image" href={asset.src} x={asset.anchor.x - asset.width / 2} y={asset.anchor.y - asset.depth / 2} width={asset.width} height={asset.depth} preserveAspectRatio="none" transform={`rotate(${rotation} ${asset.anchor.x} ${asset.anchor.y})`} />
        <polygon className="media-selection" data-selected={selected} points={polygonPoints(asset.polygon)} />
      </g>;
    })}
  </g>;
}

function ScenePlan({ mode, onModeChange, selection, onSelect, showModeRail = true, compact = false }) {
  const padding = compact ? 240 : 850;
  const viewBox = `${projection.viewBox.x - padding} ${projection.viewBox.y - padding} ${projection.viewBox.width + padding * 2.45} ${projection.viewBox.height + padding * 2}`;
  return <div className={`plan${compact ? ' plan--compact' : ''}`}>
    <svg viewBox={viewBox} aria-label="整屋 CAD 与家具俯视图" role="group">
      <defs>
        <pattern id="floor-oak" width="1800" height="1800" patternUnits="userSpaceOnUse">
          <image href="/assets/materials/floor-oak-light.webp" width="1800" height="1800" opacity="0.38" preserveAspectRatio="xMidYMid slice" />
        </pattern>
        <pattern id="floor-tile" width="1800" height="1800" patternUnits="userSpaceOnUse">
          <image href="/assets/materials/floor-tile-warm.webp" width="1800" height="1800" opacity="0.48" preserveAspectRatio="xMidYMid slice" />
        </pattern>
      </defs>
      <rect className="drawing-sheet" x={projection.viewBox.x - padding} y={projection.viewBox.y - padding} width={projection.viewBox.width + padding * 2.45} height={projection.viewBox.height + padding * 2} />
      {mode === 'cad' && <CadLayer selection={selection} onSelect={onSelect} />}
      {mode === 'furniture' && <><CadLayer selection={selection} onSelect={onSelect} showFurniture={false} showAnnotations={false} showDimensions={false} showTexture subtle /><MediaLayer selection={selection} onSelect={onSelect} /></>}
      {mode === 'overlay' && <><CadLayer selection={selection} onSelect={onSelect} showFurniture={false} showDimensions={!compact} showTexture /><MediaLayer selection={selection} onSelect={onSelect} /></>}
    </svg>
    {showModeRail && <nav className="mode-rail" aria-label="二维显示模式">
      {modeOptions.map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-label={label} title={label} aria-pressed={mode === id} onClick={() => onModeChange(id)}><Icon size={19} weight={mode === id ? 'bold' : 'regular'} aria-hidden="true" /><span className="mode-rail__tooltip" aria-hidden="true">{label}</span></button>)}
    </nav>}
    {!compact && <div className="plan__scale" aria-hidden="true"><span>1:50</span><span>单位：mm</span></div>}
  </div>;
}

function findEntity(selection) {
  if (!selection) return null;
  const collection = { room: scene.rooms, object: scene.objects, opening: scene.openings, surface: scene.surfaces }[selection.kind];
  const entity = collection?.find((candidate) => candidate.id === selection.id);
  return entity ? { kind: selection.kind, entity } : null;
}

function entityName(kind, entity) {
  if (kind === 'room') return roomLabels[entity.id] ?? entity.name;
  if (kind === 'object') return objectLabels[entity.id] ?? entity.name;
  return entity.kind ?? entity.id;
}

function Inspector({ selection, onNavigate, mode, workspaceMode, renderStats }) {
  const selected = findEntity(selection);
  const cameraPresets = new Map(scene.cameraPresets.map((preset) => [preset.id, preset]));
  return <aside className="panel inspector" aria-label="Canonical entity inspector">
    <div className="panel__header"><div><p className="panel__kicker">Selection map</p><h2 className="panel__title">对象与房间</h2></div><span className="panel__meta">{workspaceMode === '3d' ? '实时 3D' : modeOptions.find((item) => item.id === mode)?.label}</span></div>
    <div className="inspector__content">
      {workspaceMode === '3d' && <dl className="render-stats" aria-label="3D rendering statistics"><div><dt>FPS</dt><dd>{renderStats.fps || '—'}</dd></div><div><dt>Draw calls</dt><dd>{renderStats.calls || '—'}</dd></div><div><dt>Triangles</dt><dd>{renderStats.triangles ? renderStats.triangles.toLocaleString() : '—'}</dd></div><div><dt>GLB</dt><dd>{renderStats.assets || scene.objects.length}</dd></div></dl>}
      <ul className="entity-list">{scene.rooms.map((room) => {
        const objects = scene.objects.filter((object) => object.roomId === room.id);
        return <li className="entity-list__room" key={room.id}>
          <button className="entity-list__room-button" type="button" aria-pressed={selection?.kind === 'room' && selection.id === room.id} onClick={() => onNavigate({ kind: 'room', id: room.id }, room.cameraPresetIds[0])}><span>{entityName('room', room)}</span><span className="entity-list__type">俯视</span></button>
          {objects.length > 0 && <ul className="entity-list__objects">{objects.map((object) => {
            const preset = cameraPresets.get(object.preferredCameraPresetId);
            return <li key={object.id}><button type="button" aria-pressed={selection?.kind === 'object' && selection.id === object.id} onClick={() => onNavigate({ kind: 'object', id: object.id }, object.preferredCameraPresetId)}><span>{entityName('object', object)}</span><span className="entity-list__type">{preset?.label ?? '选择'}</span></button></li>;
          })}</ul>}
        </li>;
      })}</ul>
      {selected ? <dl className="inspector__details"><div className="inspector__row"><dt>类型</dt><dd>{entityKinds[selected.kind]}</dd></div>{Object.entries(selected.entity).map(([key, value]) => <div className="inspector__row" key={key}><dt>{key}</dt><dd>{typeof value === 'string' ? value : JSON.stringify(value)}</dd></div>)}</dl> : <div className="empty">点击房间或家具，检查它对应的唯一 scene ID。</div>}
    </div>
  </aside>;
}

function getRoomViewPresets(roomId) {
  const room = scene.rooms.find((candidate) => candidate.id === roomId);
  return (room?.cameraPresetIds ?? [])
    .map((id) => scene.cameraPresets.find((preset) => preset.id === id))
    .filter((preset) => preset && !preset.objectId);
}

function selectionFromId(id) {
  if (typeof id !== 'string' || !id) return null;
  for (const [kind, collection] of Object.entries({ room: scene.rooms, surface: scene.surfaces, opening: scene.openings, object: scene.objects })) {
    if (collection.some((entity) => entity.id === id)) return { kind, id };
  }
  return null;
}

function usePathname() {
  const [pathname, setPathname] = useState(() => (typeof window === 'undefined' ? '/project/demo' : window.location.pathname));

  useEffect(() => {
    const handlePopState = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (nextPathname) => {
    if (typeof window === 'undefined' || window.location.pathname === nextPathname) return;
    window.history.pushState({}, '', nextPathname);
    window.dispatchEvent(new PopStateEvent('popstate'));
    setPathname(nextPathname);
  };

  return [pathname, navigate];
}

function LabScenePage() {
  const [mode, setMode] = useState('overlay');
  const [workspaceMode, setWorkspaceMode] = useState('3d');
  const [selection, setSelection] = useState({ kind: 'room', id: 'room-living-dining' });
  const [activeRoomId, setActiveRoomId] = useState('room-living-dining');
  const [viewRequest, setViewRequest] = useState(null);
  const [renderStats, setRenderStats] = useState({ fps: 0, calls: 0, triangles: 0, assets: 0 });
  const [copyStatus, setCopyStatus] = useState('复制 JSON');
  const validation = useMemo(() => validateScene(scene), []);

  useEffect(() => {
    const clearSelection = (event) => { if (event.key === 'Escape') setSelection(null); };
    window.addEventListener('keydown', clearSelection);
    return () => window.removeEventListener('keydown', clearSelection);
  }, []);

  const copyJson = async () => {
    try { await navigator.clipboard.writeText(serialized); setCopyStatus('已复制'); }
    catch { setCopyStatus('复制失败'); }
    window.setTimeout(() => setCopyStatus('复制 JSON'), 1200);
  };

  const selectEntity = (nextSelection) => {
    setSelection(nextSelection);
    const selected = findEntity(nextSelection);
    const roomId = selected?.kind === 'room' ? selected.entity.id : selected?.entity.roomId;
    if (roomId) setActiveRoomId(roomId);
  };

  const navigateEntity = (nextSelection, presetId) => {
    selectEntity(nextSelection);
    if (workspaceMode === '3d' && presetId) {
      setViewRequest((current) => ({ id: presetId, sequence: (current?.sequence ?? 0) + 1 }));
    }
  };

  return <main className="lab">
    <header className="lab__header"><div><p className="eyebrow">Gate 2 · same-source spatial proof</p><h1>2D 户型与真实 3D 同源场景</h1><p className="lab__lede">九件原创 GLB、墙体开洞、PBR 材质和可复现镜头全部读取 Gate 1 的同一份毫米级 scene。点击房间地面会先飞到三维俯视，再选入口、主功能面或自由视角。</p></div><span className={`status ${validation.ok ? '' : 'status--error'}`}>{validation.ok ? 'VALID SCENE' : `${validation.errors.length} ERRORS`}</span></header>
    <div className="lab__workspace"><section className="panel plan-panel" aria-labelledby="plan-title"><div className="panel__header panel__header--plan"><div><p className="panel__kicker">Canonical · 11,000 × 8,000 mm</p><h2 className="panel__title" id="plan-title">{workspaceMode === '3d' ? '一层数字住宅' : '一层建筑平面'}</h2></div><div className="workspace-switch" aria-label="空间显示维度"><button type="button" aria-pressed={workspaceMode === '2d'} onClick={() => setWorkspaceMode('2d')}><MapTrifold size={16} />2D</button><button type="button" aria-pressed={workspaceMode === '3d'} onClick={() => setWorkspaceMode('3d')}><Cube size={16} />3D</button></div></div>{workspaceMode === '2d' ? <ScenePlan mode={mode} onModeChange={setMode} selection={selection} onSelect={selectEntity} /> : <Scene3D key="surface-occlusion-v1" scene={scene} selection={selection} onSelect={selectEntity} activeRoomId={activeRoomId} roomLabels={roomLabels} onStats={setRenderStats} viewRequest={viewRequest} />}</section><Inspector selection={selection} onNavigate={navigateEntity} mode={mode} workspaceMode={workspaceMode} renderStats={renderStats} /></div>
    <section className="evidence" aria-label="Scene validation evidence"><div className="panel evidence__summary"><p className="evidence__label">Validation evidence</p><dl className="evidence__facts"><dt>Scene</dt><dd>{scene.id}</dd><dt>Schema</dt><dd>v{scene.schemaVersion}</dd><dt>Rooms</dt><dd>{scene.rooms.length}</dd><dt>Objects / GLB</dt><dd>{scene.objects.length} / {scene.objects.length}</dd><dt>Camera presets</dt><dd>{scene.cameraPresets.length}</dd><dt>Round trip</dt><dd>{roundTripMatches ? 'byte-identical' : 'mismatch'}</dd></dl>{!validation.ok && <ul className="validation-list">{validation.errors.map((error) => <li key={`${error.code}-${error.path}`}>{error.path}: {error.message}</li>)}</ul>}</div><div className="panel evidence__json"><div className="evidence__json-header"><div><p className="evidence__label">Canonical JSON</p><span className="panel__meta">{serializedBytes.toLocaleString()} bytes · read only</span></div><button className="utility-button" type="button" onClick={copyJson}>{copyStatus}</button></div><textarea className="json" readOnly spellCheck="false" value={serialized} aria-label="Canonical scene JSON" /></div></section>
  </main>;
}

function ProjectDemoPage() {
  const initialNavigation = useMemo(() => parseViewState(typeof window === 'undefined' ? '' : window.location.search, scene), []);
  const [navigation, setNavigation] = useState(initialNavigation);
  const [viewSequence, setViewSequence] = useState(1);
  const [displayViewId, setDisplayViewId] = useState(initialNavigation.viewId);
  const [pathname] = usePathname();
  const homePreset = scene.cameraPresets.find((preset) => preset.kind === 'whole_home');
  const selection = selectionFromId(navigation.selectedId) ?? (navigation.roomId ? { kind: 'room', id: navigation.roomId } : null);
  const selectedEntity = findEntity(selection);
  const activeRoomId = navigation.roomId;
  const currentRoom = scene.rooms.find((room) => room.id === activeRoomId) ?? null;
  const currentRoomLabel = currentRoom ? (roomLabels[currentRoom.id] ?? currentRoom.name) : '整屋';
  const currentViewLabel = displayViewId === 'free'
    ? '自由视角'
    : scene.cameraPresets.find((preset) => preset.id === displayViewId)?.label ?? '整屋';
  const selectedLabel = selectedEntity ? entityName(selectedEntity.kind, selectedEntity.entity) : '未选择对象';
  const viewRequest = useMemo(
    () => ({ id: navigation.viewId, sequence: viewSequence }),
    [navigation.viewId, viewSequence],
  );

  useEffect(() => {
    document.title = pathname.startsWith('/lab/scene')
      ? '欧派 AI 家装共识层 · 技术页'
      : '家庭共创设计器 · 数字住宅';
  }, [pathname]);

  useEffect(() => {
    const handlePopState = () => {
      const restored = parseViewState(window.location.search, scene);
      setNavigation(restored);
      setDisplayViewId(restored.viewId);
      setViewSequence((value) => value + 1);
    };
    const canonicalQuery = serializeViewState(initialNavigation, scene);
    if (window.location.search !== canonicalQuery) {
      window.history.replaceState({}, '', `${window.location.pathname}${canonicalQuery}`);
    }
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [initialNavigation]);

  const commitNavigation = (nextState, { replace = false, moveCamera = true } = {}) => {
    const safe = sanitizeViewState(nextState, scene);
    const query = serializeViewState(safe, scene);
    const nextUrl = `${window.location.pathname}${query}`;
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (nextUrl !== currentUrl || replace) {
      window.history[replace ? 'replaceState' : 'pushState']({}, '', nextUrl);
    }
    setNavigation(safe);
    setDisplayViewId(safe.viewId);
    if (moveCamera) setViewSequence((value) => value + 1);
  };

  const jumpToHome = () => {
    if (!homePreset) return;
    commitNavigation({ roomId: null, viewId: homePreset.id, selectedId: null });
  };

  const jumpToRoom = (roomId, selectedId = roomId) => {
    const room = scene.rooms.find((candidate) => candidate.id === roomId);
    const preset = getRoomViewPresets(roomId)[0];
    if (!room || !preset) return;
    commitNavigation({ roomId: room.id, viewId: preset.id, selectedId });
  };

  const jumpToRoomView = (presetId) => {
    const preset = scene.cameraPresets.find((candidate) => candidate.id === presetId && candidate.roomId === activeRoomId);
    if (!preset) return;
    commitNavigation({ ...navigation, viewId: preset.id });
  };

  const selectEntity = (nextSelection) => {
    const entity = findEntity(nextSelection);
    if (!entity) return;
    commitNavigation({
      roomId: activeRoomId,
      viewId: navigation.viewId,
      selectedId: entity.entity.id,
    }, { replace: true, moveCamera: false });
  };

  const navigateFromPlan = (nextSelection) => {
    const entity = findEntity(nextSelection);
    if (!entity) return;
    const roomId = entity.kind === 'room' ? entity.entity.id : entity.entity.roomId;
    if (roomId === activeRoomId) selectEntity(nextSelection);
    else if (roomId) jumpToRoom(roomId, entity.entity.id);
  };

  return <main className="product-shell project-demo" data-room-id={activeRoomId ?? ''} data-selected-id={navigation.selectedId ?? ''}>
    <header className="product-hero">
      <div className="product-brand">
        <span className="product-brand__mark" aria-hidden="true">元</span>
        <div>
          <p className="eyebrow">家庭共创设计器</p>
          <h1>一层数字住宅</h1>
        </div>
      </div>
      <div className="product-breadcrumb" aria-live="polite"><span>整屋</span>{currentRoom && <><span aria-hidden="true">/</span><strong>{currentRoomLabel}</strong><span aria-hidden="true">/</span><span>{currentViewLabel}</span></>}</div>
      <div className="product-hero__meta">
        <span className="status">实时 2D / 3D 同源</span>
        <button className="utility-button utility-button--strong" data-testid="return-home" type="button" onClick={jumpToHome} disabled={!activeRoomId && navigation.viewId === homePreset?.id}>返回整屋</button>
      </div>
    </header>

    <section className="product-grid">
      <section className="panel project-stage" aria-labelledby="project-stage-title">
        <div className="panel__header panel__header--project">
          <div>
            <p className="panel__kicker">实时 3D · 同一场景</p>
            <h2 className="panel__title" id="project-stage-title">{currentRoomLabel}</h2>
          </div>
          <div className="project-stage__summary"><span>当前选择</span><strong>{selectedLabel}</strong><small>{currentViewLabel}</small></div>
        </div>
        <Scene3D
          key="project-demo-scene"
          scene={scene}
          selection={selection}
          onSelect={selectEntity}
          onNavigate={({ selection: nextSelection, presetId, reason }) => {
            if (reason === 'room' && nextSelection?.kind === 'room') jumpToRoom(nextSelection.id);
            else jumpToRoomView(presetId);
          }}
          activeRoomId={activeRoomId}
          roomLabels={roomLabels}
          onStats={() => {}}
          viewRequest={viewRequest}
          onViewEvent={({ phase, preset }) => { if (phase === 'done') setDisplayViewId(preset.id); }}
          showHomeView={false}
        />
      </section>

      <aside className="project-sidebar">
        <article className="panel project-panel project-panel--overview">
          <div className="panel__header">
            <div>
              <p className="panel__kicker">2D 同步总览</p>
              <h2 className="panel__title">当前户型与布置</h2>
            </div>
            <span className="panel__meta">点击空间进入俯视</span>
          </div>
          <div className="project-overview" data-testid="overview-2d">
            <ScenePlan mode="overlay" selection={selection} onSelect={navigateFromPlan} showModeRail={false} compact />
          </div>
        </article>

        <article className="panel project-panel project-context" aria-label="当前位置摘要">
          <div className="project-context__lead"><span className="live-dot" /><div><span>当前位置</span><strong>{currentRoomLabel}</strong></div></div>
          <dl className="project-context__facts"><div><dt>视角</dt><dd>{currentViewLabel}</dd></div><div><dt>选择</dt><dd>{selectedLabel}</dd></div></dl>
          <p>{activeRoomId ? '使用画布底部的视角胶囊切换俯视、入口与主功能面；选择对象不会因切换镜头而丢失。' : '从 3D 房间地面或右侧 2D 户型选择空间，镜头会先进入三维俯视。'}</p>
        </article>
      </aside>
    </section>
  </main>;
}

export default function App() {
  const [pathname, navigate] = usePathname();
  const demoRoute = pathname === '/' || pathname === '/index.html' || pathname.startsWith('/project/demo');
  const page = demoRoute ? <ProjectDemoPage /> : <LabScenePage />;

  useEffect(() => {
    if (pathname === '/' || pathname === '/index.html') navigate('/project/demo');
  }, [navigate, pathname]);

  return page;
}
