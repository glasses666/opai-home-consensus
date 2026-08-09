import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Armchair, ChatCircleDots, Check, ClockCounterClockwise, Cube, FloppyDisk, HouseLine, MapTrifold, PaperPlaneTilt, Sparkle, StackSimple, X } from '@phosphor-icons/react';
import Scene3D from './Scene3D.jsx';
import { runAgentTurn, TOOL_REGISTRY } from './agent/harness.js';
import { createDemoScene } from './domain/demo-scene.js';
import {
  compareSceneVersions,
  confirmSceneVersion,
  createVersionHistory,
  deserializeVersionHistory,
  restoreSceneVersion,
  saveSceneVersion,
  sceneStoreForVersion,
  serializeVersionHistory,
} from './domain/design-version.js';
import { evaluateDesignRules } from './domain/design-rules.js';
import { projectScene2D } from './domain/projection.js';
import {
  createSceneStore,
  deserializeScene,
  dispatchSceneCommand,
  redoSceneCommand,
  serializeScene,
  undoSceneCommand,
  validateScene,
} from './domain/scene.js';
import { objectNavigationPreset, parseViewState, sanitizeViewState, serializeViewState } from './domain/view-state.js';

const scene = createSceneStore(createDemoScene()).currentScene;
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

const materialLabels = {
  'mat-door-warm-white': '暖白',
  'mat-fabric-warm-gray': '暖灰织物',
  'mat-oak-veneer': '浅橡木',
};
const versionStatusLabels = {
  drafting: '草拟中',
  impact_review: '待影响确认',
  customer_confirmed: '已确认',
  changed_after_confirm: '确认后修改',
};
const diffKindLabels = {
  added: '新增',
  deleted: '删除',
  transform: '位置 / 旋转',
  dimensions: '尺寸',
  material: '材质',
};
const ruleStatusLabels = { blocked: '阻止', warning: '提醒', recommendation: '建议', passed: '通过' };
const editErrorMessages = [
  [/OBJECT_FOOTPRINT_OUTSIDE_ROOM/, '这件家具已经压出所属房间了，请往房间内侧移动一点。'],
  [/CLEARANCE_OCCUPIED/, '这里会占用必要通行或使用净距，请给动线和开门留出空间。'],
  [/OBJECT_COLLISION/, '这里会和另一件家具重叠，请错开一点再放。'],
  [/DOOR_SWING_OCCUPIED/, '这里挡到了门扇开启范围，请避开门的开启弧线。'],
  [/ROOM_BOUNDARY/, '这件家具需要完整留在当前房间边界内。'],
  [/OBJECT_NOT_MOVABLE/, '这个对象属于固定构件，不能直接移动。'],
  [/OBJECT_NOT_ROTATABLE/, '这个对象当前不允许旋转。'],
  [/OBJECT_MATERIAL_LOCKED/, '这个对象的材质由当前方案锁定，不能直接更换。'],
  [/OBJECT_PARAMETERS_LOCKED/, '这个对象的尺寸由当前方案锁定，不能直接改参数。'],
];

const normalizeEditError = (error) => {
  const raw = error instanceof Error ? error.message : '未知错误';
  const stripped = raw.replace(/^DESIGN_RULE_BLOCKED: /, '');
  const match = editErrorMessages.find(([pattern]) => pattern.test(stripped));
  return match ? match[1] : stripped;
};
const reviewableRuleStatuses = new Set(['warning', 'recommendation']);
const spatialReviewCommands = new Set(['object.setTransform', 'object.setDimensions']);
const ruleReviewKey = (check) => [
  check.status,
  check.code,
  check.ruleId,
  [...check.objectIds].sort().join(','),
  check.message,
  check.valueMm ?? '',
].join('|');
const reviewableChecksForObjects = (evaluation, objectIds) => {
  const ids = new Set(objectIds.filter(Boolean));
  if (!ids.size) return [];
  return evaluation.checks.filter((check) => (
    reviewableRuleStatuses.has(check.status) &&
    check.objectIds.some((id) => ids.has(id))
  ));
};
const newReviewChecks = (before, after, objectIds) => {
  const beforeKeys = new Set(before.checks.filter((check) => reviewableRuleStatuses.has(check.status)).map(ruleReviewKey));
  return reviewableChecksForObjects(after, objectIds).filter((check) => !beforeKeys.has(ruleReviewKey(check)));
};
const topRuleStatus = (checks) => checks.some((check) => check.status === 'warning') ? 'warning' : 'recommendation';
const VERSION_STORAGE_KEY = 'oppein.project-demo.versions.v1';
const agentWriteTools = new Set(TOOL_REGISTRY.filter((tool) => tool.writes).map((tool) => tool.name));
const agentToolLabels = {
  apply_catalog_item: '应用组件',
  check_rules: '检查规则',
  compare_versions: '比较版本',
  delete_object: '删除对象',
  inspect_catalog_item: '读取组件',
  inspect_object: '读取对象',
  inspect_room: '读取房间',
  move_object: '移动对象',
  request_clarification: '澄清需求',
  request_confirmation: '请求确认',
  rotate_object: '旋转对象',
  search_catalog: '检索组件',
  set_object_material: '修改家具材质',
  set_surface_material: '修改表面材质',
};

const agentReplyFromTrace = (trace, { savedLabel = null, pending = false } = {}) => {
  const failed = trace.steps.find((step) => !step.ok);
  if (trace.rolledBack || failed) {
    const reason = normalizeEditError(new Error(failed?.error ?? '规则未通过')).replace(/[。！？!?]+$/, '');
    return `这次没有写入场景：${reason}。你可以换一个距离或方向再试。`;
  }
  const clarification = trace.steps.find((step) => step.tool === 'request_clarification' && step.ok)?.result;
  if (clarification?.question) return clarification.question;
  const confirmation = trace.steps.find((step) => step.tool === 'request_confirmation' && step.ok)?.result;
  if (confirmation?.message) return confirmation.message;
  const comparison = trace.steps.find((step) => step.tool === 'compare_versions' && step.ok)?.result;
  if (comparison) return `已按真实版本数据比较：${comparison.objectDiffs?.length ?? 0} 项对象变化，${comparison.ruleDiffs?.length ?? 0} 项规则变化，${comparison.impact?.unresolved?.length ?? 0} 项仍待确认。`;
  const writes = trace.steps.filter((step) => step.ok && agentWriteTools.has(step.tool));
  if (writes.length) {
    const actions = [...new Set(writes.map((step) => agentToolLabels[step.tool] ?? step.tool))].join('、');
    if (pending) return `已生成${actions}预览；有 demo 规范提醒，请先保留或撤销，再进入版本链。`;
    return `已完成${actions}，确定性规则已检查${savedLabel ? `，并保存为 ${savedLabel}` : ''}。`;
  }
  return trace.assistantReply || '已读取当前场景，没有修改 2D / 3D。';
};

const createInitialVersionProject = () => {
  const fallbackStore = createSceneStore(createDemoScene());
  const fallback = { history: createVersionHistory(fallbackStore), store: fallbackStore };
  if (typeof window === 'undefined') return fallback;
  try {
    const serializedHistory = window.localStorage.getItem(VERSION_STORAGE_KEY);
    if (!serializedHistory) return fallback;
    const history = deserializeVersionHistory(serializedHistory);
    if (serializeScene(history.initialScene) !== serializeScene(fallbackStore.initialScene)) throw new Error('VERSION_FIXTURE_CHANGED');
    return { history, store: sceneStoreForVersion(history) };
  } catch {
    window.localStorage.removeItem(VERSION_STORAGE_KEY);
    return fallback;
  }
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

function CadLayer({ sceneModel, projection, selection, onSelect, showFurniture = true, showAnnotations = true, showDimensions = true, showTexture = false, subtle = false }) {
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
        const object = sceneModel.objects.find((candidate) => candidate.id === footprint.sourceObjectId);
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

function MediaLayer({ sceneModel, projection, selection, onSelect }) {
  return <g data-layer="media">
    {projection.layers.media.assets.map((asset) => {
      const object = sceneModel.objects.find((candidate) => candidate.id === asset.sourceObjectId);
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

function ScenePlan({ sceneModel = scene, mode, onModeChange, selection, onSelect, showModeRail = true, compact = false }) {
  const currentProjection = useMemo(() => projectScene2D(sceneModel), [sceneModel]);
  const padding = compact ? 240 : 850;
  const viewBox = `${currentProjection.viewBox.x - padding} ${currentProjection.viewBox.y - padding} ${currentProjection.viewBox.width + padding * 2.45} ${currentProjection.viewBox.height + padding * 2}`;
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
      <rect className="drawing-sheet" x={currentProjection.viewBox.x - padding} y={currentProjection.viewBox.y - padding} width={currentProjection.viewBox.width + padding * 2.45} height={currentProjection.viewBox.height + padding * 2} />
      {mode === 'cad' && <CadLayer sceneModel={sceneModel} projection={currentProjection} selection={selection} onSelect={onSelect} />}
      {mode === 'furniture' && <><CadLayer sceneModel={sceneModel} projection={currentProjection} selection={selection} onSelect={onSelect} showFurniture={false} showAnnotations={false} showDimensions={false} showTexture subtle /><MediaLayer sceneModel={sceneModel} projection={currentProjection} selection={selection} onSelect={onSelect} /></>}
      {mode === 'overlay' && <><CadLayer sceneModel={sceneModel} projection={currentProjection} selection={selection} onSelect={onSelect} showFurniture={false} showDimensions={!compact} showTexture /><MediaLayer sceneModel={sceneModel} projection={currentProjection} selection={selection} onSelect={onSelect} /></>}
    </svg>
    {showModeRail && <nav className="mode-rail" aria-label="二维显示模式">
      {modeOptions.map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-label={label} title={label} aria-pressed={mode === id} onClick={() => onModeChange(id)}><Icon size={19} weight={mode === id ? 'bold' : 'regular'} aria-hidden="true" /><span className="mode-rail__tooltip" aria-hidden="true">{label}</span></button>)}
    </nav>}
    {!compact && <div className="plan__scale" aria-hidden="true"><span>1:50</span><span>单位：mm</span></div>}
  </div>;
}

function findEntity(sceneModel, selection) {
  if (!selection) return null;
  const collection = { room: sceneModel.rooms, object: sceneModel.objects, opening: sceneModel.openings, surface: sceneModel.surfaces }[selection.kind];
  const entity = collection?.find((candidate) => candidate.id === selection.id);
  return entity ? { kind: selection.kind, entity } : null;
}

function entityName(kind, entity) {
  if (kind === 'room') return roomLabels[entity.id] ?? entity.name;
  if (kind === 'object') return objectLabels[entity.id] ?? entity.name;
  return entity.kind ?? entity.id;
}

function Inspector({ sceneModel, selection, onNavigate, mode, workspaceMode, renderStats }) {
  const selected = findEntity(sceneModel, selection);
  return <aside className="panel inspector" aria-label="Canonical entity inspector">
    <div className="panel__header"><div><p className="panel__kicker">Selection map</p><h2 className="panel__title">对象与房间</h2></div><span className="panel__meta">{workspaceMode === '3d' ? '实时 3D' : modeOptions.find((item) => item.id === mode)?.label}</span></div>
    <div className="inspector__content">
      {workspaceMode === '3d' && <dl className="render-stats" aria-label="3D rendering statistics"><div><dt>FPS</dt><dd>{renderStats.fps || '—'}</dd></div><div><dt>Draw calls</dt><dd>{renderStats.calls || '—'}</dd></div><div><dt>Triangles</dt><dd>{renderStats.triangles ? renderStats.triangles.toLocaleString() : '—'}</dd></div><div><dt>GLB</dt><dd>{renderStats.assets || sceneModel.objects.length}</dd></div></dl>}
      <ul className="entity-list">{sceneModel.rooms.map((room) => {
        const objects = sceneModel.objects.filter((object) => object.roomId === room.id);
        return <li className="entity-list__room" key={room.id}>
          <button className="entity-list__room-button" type="button" aria-pressed={selection?.kind === 'room' && selection.id === room.id} onClick={() => onNavigate({ kind: 'room', id: room.id }, room.cameraPresetIds[0])}><span>{entityName('room', room)}</span><span className="entity-list__type">俯视</span></button>
        {objects.length > 0 && <ul className="entity-list__objects">{objects.map((object) => {
            const preset = objectNavigationPreset(sceneModel, object);
            return <li key={object.id}><button type="button" aria-pressed={selection?.kind === 'object' && selection.id === object.id} onClick={() => onNavigate({ kind: 'object', id: object.id }, preset?.id)}><span>{entityName('object', object)}</span><span className="entity-list__type">{preset?.label ?? '选择'}</span></button></li>;
          })}</ul>}
        </li>;
      })}</ul>
      {selected ? <dl className="inspector__details"><div className="inspector__row"><dt>类型</dt><dd>{entityKinds[selected.kind]}</dd></div>{Object.entries(selected.entity).map(([key, value]) => <div className="inspector__row" key={key}><dt>{key}</dt><dd>{typeof value === 'string' ? value : JSON.stringify(value)}</dd></div>)}</dl> : <div className="empty">点击房间或家具，检查它对应的唯一 scene ID。</div>}
    </div>
  </aside>;
}

function getRoomViewPresets(sceneModel, roomId) {
  const room = sceneModel.rooms.find((candidate) => candidate.id === roomId);
  return (room?.cameraPresetIds ?? [])
    .map((id) => sceneModel.cameraPresets.find((preset) => preset.id === id))
    .filter((preset) => preset && !preset.objectId);
}

function selectionFromId(sceneModel, id) {
  if (typeof id !== 'string' || !id) return null;
  for (const [kind, collection] of Object.entries({ room: sceneModel.rooms, surface: sceneModel.surfaces, opening: sceneModel.openings, object: sceneModel.objects })) {
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
    const selected = findEntity(scene, nextSelection);
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
    <div className="lab__workspace"><section className="panel plan-panel" aria-labelledby="plan-title"><div className="panel__header panel__header--plan"><div><p className="panel__kicker">Canonical · 11,000 × 8,000 mm</p><h2 className="panel__title" id="plan-title">{workspaceMode === '3d' ? '一层数字住宅' : '一层建筑平面'}</h2></div><div className="workspace-switch" aria-label="空间显示维度"><button type="button" aria-pressed={workspaceMode === '2d'} onClick={() => setWorkspaceMode('2d')}><MapTrifold size={16} />2D</button><button type="button" aria-pressed={workspaceMode === '3d'} onClick={() => setWorkspaceMode('3d')}><Cube size={16} />3D</button></div></div>{workspaceMode === '2d' ? <ScenePlan sceneModel={scene} mode={mode} onModeChange={setMode} selection={selection} onSelect={selectEntity} /> : <Scene3D key="surface-occlusion-v1" scene={scene} selection={selection} onSelect={selectEntity} activeRoomId={activeRoomId} roomLabels={roomLabels} onStats={setRenderStats} viewRequest={viewRequest} />}</section><Inspector sceneModel={scene} selection={selection} onNavigate={navigateEntity} mode={mode} workspaceMode={workspaceMode} renderStats={renderStats} /></div>
    <section className="evidence" aria-label="Scene validation evidence"><div className="panel evidence__summary"><p className="evidence__label">Validation evidence</p><dl className="evidence__facts"><dt>Scene</dt><dd>{scene.id}</dd><dt>Schema</dt><dd>v{scene.schemaVersion}</dd><dt>Rooms</dt><dd>{scene.rooms.length}</dd><dt>Objects / GLB</dt><dd>{scene.objects.length} / {scene.objects.length}</dd><dt>Camera presets</dt><dd>{scene.cameraPresets.length}</dd><dt>Round trip</dt><dd>{roundTripMatches ? 'byte-identical' : 'mismatch'}</dd></dl>{!validation.ok && <ul className="validation-list">{validation.errors.map((error) => <li key={`${error.code}-${error.path}`}>{error.path}: {error.message}</li>)}</ul>}</div><div className="panel evidence__json"><div className="evidence__json-header"><div><p className="evidence__label">Canonical JSON</p><span className="panel__meta">{serializedBytes.toLocaleString()} bytes · read only</span></div><button className="utility-button" type="button" onClick={copyJson}>{copyStatus}</button></div><textarea className="json" readOnly spellCheck="false" value={serialized} aria-label="Canonical scene JSON" /></div></section>
  </main>;
}

function ProjectDemoPage() {
  const [initialVersionProject] = useState(createInitialVersionProject);
  const [sceneStore, setSceneStore] = useState(initialVersionProject.store);
  const [versionHistory, setVersionHistory] = useState(initialVersionProject.history);
  const sceneStoreRef = useRef(sceneStore);
  const versionHistoryRef = useRef(versionHistory);
  sceneStoreRef.current = sceneStore;
  versionHistoryRef.current = versionHistory;
  const currentScene = sceneStore.currentScene;
  const initialNavigation = useMemo(() => parseViewState(typeof window === 'undefined' ? '' : window.location.search, scene), []);
  const [navigation, setNavigation] = useState(initialNavigation);
  const [viewSequence, setViewSequence] = useState(1);
  const [displayViewId, setDisplayViewId] = useState(initialNavigation.viewId);
  const [displayRoomId, setDisplayRoomId] = useState(initialNavigation.roomId);
  const [displaySelectedId, setDisplaySelectedId] = useState(initialNavigation.selectedId);
  const [renderStats, setRenderStats] = useState({ fps: 0, calls: 0, triangles: 0, assets: 0 });
  const [assetLoadState, setAssetLoadState] = useState({ completed: 0, failed: 0, total: currentScene.objects.length });
  const [editMode, setEditMode] = useState('move');
  const [editFeedback, setEditFeedback] = useState({ tone: 'neutral', message: '选择家具后可编辑' });
  const [pendingReview, setPendingReview] = useState(null);
  const [lastRejected, setLastRejected] = useState(null);
  const [dimensionDraft, setDimensionDraft] = useState(null);
  const [versionDrawerOpen, setVersionDrawerOpen] = useState(false);
  const [compareFromVersionId, setCompareFromVersionId] = useState(initialVersionProject.history.versions[0].id);
  const [sidecarMode, setSidecarMode] = useState('space');
  const [agentInput, setAgentInput] = useState('');
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentCapability, setAgentCapability] = useState({ aily: 'checking', base: 'checking', provider: 'local' });
  const [agentMessages, setAgentMessages] = useState([{
    id: 'agent-welcome',
    role: 'assistant',
    text: '我会读取当前选择和最新版本，只通过受约束工具修改场景。需要真实欧派数据的部分会明确留作未决项。',
    source: 'local',
    tools: [],
  }]);
  const agentMessageListRef = useRef(null);
  const [pathname] = usePathname();
  const homePreset = currentScene.cameraPresets.find((preset) => preset.kind === 'whole_home');
  const selection = selectionFromId(currentScene, navigation.selectedId) ?? (navigation.roomId ? { kind: 'room', id: navigation.roomId } : null);
  const displaySelection = selectionFromId(currentScene, displaySelectedId) ?? (displayRoomId ? { kind: 'room', id: displayRoomId } : null);
  const selectedEntity = findEntity(currentScene, selection);
  const displaySelectedEntity = findEntity(currentScene, displaySelection);
  const selectedObject = selectedEntity?.kind === 'object' ? selectedEntity.entity : null;
  const designEvaluation = useMemo(() => evaluateDesignRules(currentScene), [currentScene]);
  const versions = versionHistory.versions;
  const currentVersion = versions.find((version) => version.id === versionHistory.currentVersionId) ?? versions.at(-1);
  const hasUnsavedChanges = serializeScene(currentVersion.scene) !== serializeScene(currentScene);
  const workingVersion = hasUnsavedChanges
    ? { ...currentVersion, id: 'working-copy', label: '未保存', scene: currentScene, commands: sceneStore.commands, cursor: sceneStore.cursor }
    : currentVersion;
  const compareFromVersion = versions.find((version) => version.id === compareFromVersionId) ?? versions[0];
  const versionDiff = useMemo(
    () => compareSceneVersions(compareFromVersion, workingVersion),
    [compareFromVersion, workingVersion],
  );
  const currentVersionStatus = hasUnsavedChanges && versionHistory.confirmedVersionId
    ? 'changed_after_confirm'
    : currentVersion.status;
  const visibleRuleChecks = useMemo(() => {
    const relevant = selectedObject
      ? designEvaluation.checks.filter((check) => check.objectIds.includes(selectedObject.id))
      : designEvaluation.violations;
    return relevant
      .sort((a, b) => ['blocked', 'warning', 'recommendation', 'passed'].indexOf(a.status) - ['blocked', 'warning', 'recommendation', 'passed'].indexOf(b.status))
      .slice(0, 4);
  }, [designEvaluation, selectedObject]);
  const activeRoomId = navigation.roomId;
  const currentRoom = currentScene.rooms.find((room) => room.id === displayRoomId) ?? null;
  const currentRoomLabel = currentRoom ? (roomLabels[currentRoom.id] ?? currentRoom.name) : '整屋';
  const currentViewLabel = displayViewId === 'free'
    ? '自由视角'
    : currentScene.cameraPresets.find((preset) => preset.id === displayViewId)?.label ?? '整屋';
  const selectedLabel = displaySelectedEntity ? entityName(displaySelectedEntity.kind, displaySelectedEntity.entity) : '未选择对象';
  const agentTargetLabel = selectedObject?.capabilities?.movable ? entityName('object', selectedObject) : '沙发';
  const agentQuickPrompts = [`${agentTargetLabel}向右移动20厘米`, '检查当前规则', '对比上一版变化'];
  const namedDiffs = useMemo(() => versionDiff.objectDiffs.map((diff) => ({
    ...diff,
    label: entityName('object', currentScene.objects.find((object) => object.id === diff.objectId) ?? compareFromVersion.scene.objects.find((object) => object.id === diff.objectId) ?? { id: diff.objectId, name: diff.objectId }),
  })), [compareFromVersion.scene.objects, currentScene.objects, versionDiff.objectDiffs]);
  const versionComparison = useMemo(() => {
    if (compareFromVersion.id === currentVersion.id) return null;
    return {
      label: compareFromVersion.label,
      changeCount: namedDiffs.length,
      impactLabel: versionStatusLabels[versionDiff.impact.status] ?? versionDiff.impact.status,
      impactCount: versionDiff.impact.impacts.length,
      unresolvedCount: versionDiff.impact.unresolved.length,
    };
  }, [compareFromVersion.id, currentVersion.id, namedDiffs.length, versionDiff.impact.impacts.length, versionDiff.impact.status, versionDiff.impact.unresolved.length]);
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
      const restored = parseViewState(window.location.search, sceneStoreRef.current.currentScene);
      setNavigation(restored);
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
    const sceneModel = sceneStoreRef.current.currentScene;
    const safe = sanitizeViewState(nextState, sceneModel);
    const query = serializeViewState(safe, sceneModel);
    const nextUrl = `${window.location.pathname}${query}`;
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (nextUrl !== currentUrl || replace) {
      window.history[replace ? 'replaceState' : 'pushState']({}, '', nextUrl);
    }
    setNavigation(safe);
    if (!moveCamera) setDisplaySelectedId(safe.selectedId);
    if (moveCamera) setViewSequence((value) => value + 1);
  };

  const jumpToHome = () => {
    if (!homePreset) return;
    commitNavigation({ roomId: null, viewId: homePreset.id, selectedId: null });
  };

  const jumpToRoom = (roomId, selectedId = roomId) => {
    const room = currentScene.rooms.find((candidate) => candidate.id === roomId);
    const preset = getRoomViewPresets(currentScene, roomId)[0];
    if (!room || !preset) return;
    commitNavigation({ roomId: room.id, viewId: preset.id, selectedId });
  };

  const jumpToRoomView = (presetId) => {
    const preset = currentScene.cameraPresets.find((candidate) => candidate.id === presetId && candidate.roomId === activeRoomId);
    if (!preset) return;
    commitNavigation({ ...navigation, viewId: preset.id });
  };

  const jumpToObject = (object) => {
    const preset = objectNavigationPreset(currentScene, object);
    const fallback = getRoomViewPresets(currentScene, object.roomId)[0];
    if (!preset && !fallback) return;
    commitNavigation({
      roomId: object.roomId,
      viewId: preset?.id ?? fallback.id,
      selectedId: object.id,
    }, { replace: object.roomId === activeRoomId });
  };

  const selectEntity = (nextSelection) => {
    const entity = findEntity(currentScene, nextSelection);
    if (!entity) return;
    if (entity.kind === 'object') {
      jumpToObject(entity.entity);
      return;
    }
    commitNavigation({
      roomId: activeRoomId,
      viewId: navigation.viewId,
      selectedId: entity.entity.id,
    }, { replace: true, moveCamera: false });
  };

  const navigateFromPlan = (nextSelection) => {
    const entity = findEntity(currentScene, nextSelection);
    if (!entity) return;
    const roomId = entity.kind === 'room' ? entity.entity.id : entity.entity.roomId;
    if (entity.kind === 'object') jumpToObject(entity.entity);
    else if (roomId === activeRoomId) selectEntity(nextSelection);
    else if (roomId) jumpToRoom(roomId, entity.entity.id);
  };

  const executeCommand = useCallback((command, successMessage = '修改已应用') => {
    if (pendingReview) {
      setEditFeedback({ tone: 'warning', message: '请先保留或撤销当前预览，再继续调整。' });
      return null;
    }
    try {
      const startCursor = sceneStoreRef.current.cursor;
      const beforeEvaluation = evaluateDesignRules(sceneStoreRef.current.currentScene);
      const nextStore = dispatchSceneCommand(sceneStoreRef.current, command);
      const afterEvaluation = evaluateDesignRules(nextStore.currentScene);
      const affectedObjectIds = [command.objectId, command.newObjectId];
      const changedReviewChecks = newReviewChecks(beforeEvaluation, afterEvaluation, affectedObjectIds);
      const reviewChecks = changedReviewChecks.length || !spatialReviewCommands.has(command.type)
        ? changedReviewChecks
        : reviewableChecksForObjects(afterEvaluation, affectedObjectIds);
      sceneStoreRef.current = nextStore;
      setSceneStore(nextStore);
      setLastRejected(null);
      if (reviewChecks.length) {
        setPendingReview({
          checks: reviewChecks.slice(0, 3),
          startCursor,
          status: topRuleStatus(reviewChecks),
        });
        setEditFeedback({ tone: 'warning', message: '已生成待确认预览：有规范提醒，保留前请确认代价。' });
      } else {
        setPendingReview(null);
        setEditFeedback({ tone: 'success', message: successMessage });
      }
      return nextStore;
    } catch (error) {
      const message = normalizeEditError(error);
      setLastRejected({ message, source: 'demo' });
      setEditFeedback({ tone: 'error', message: `未应用：${message}` });
      return null;
    }
  }, [pendingReview]);

  const undo = useCallback(() => {
    try {
      const nextStore = undoSceneCommand(sceneStoreRef.current);
      sceneStoreRef.current = nextStore;
      setSceneStore(nextStore);
      setPendingReview(null);
      setLastRejected(null);
      setEditFeedback({ tone: 'success', message: '已撤销上一步' });
    } catch {
      setEditFeedback({ tone: 'error', message: '没有可撤销的修改' });
    }
  }, []);

  const redo = useCallback(() => {
    try {
      const nextStore = redoSceneCommand(sceneStoreRef.current);
      sceneStoreRef.current = nextStore;
      setSceneStore(nextStore);
      setPendingReview(null);
      setLastRejected(null);
      setEditFeedback({ tone: 'success', message: '已重做下一步' });
    } catch {
      setEditFeedback({ tone: 'error', message: '没有可重做的修改' });
    }
  }, []);

  const moveSelected = useCallback((dx, dz) => {
    const nextSelection = selectionFromId(sceneStoreRef.current.currentScene, navigation.selectedId);
    const object = findEntity(sceneStoreRef.current.currentScene, nextSelection)?.entity;
    if (!object?.capabilities?.movable) {
      setEditFeedback({ tone: 'error', message: '该对象已锁定，不能移动' });
      return;
    }
    executeCommand({ type: 'object.setTransform', objectId: object.id, transform: { x: object.transform.x + dx, z: object.transform.z + dz } }, '已移动 100 mm');
  }, [executeCommand, navigation.selectedId]);

  const rotateSelected = useCallback(() => {
    const nextSelection = selectionFromId(sceneStoreRef.current.currentScene, navigation.selectedId);
    const object = findEntity(sceneStoreRef.current.currentScene, nextSelection)?.entity;
    if (!object?.capabilities?.rotatable) {
      setEditFeedback({ tone: 'error', message: '该对象已锁定，不能旋转' });
      return;
    }
    executeCommand({ type: 'object.setTransform', objectId: object.id, transform: { rotationY: object.transform.rotationY + Math.PI / 12 } }, '已旋转 15°');
  }, [executeCommand, navigation.selectedId]);

  const deleteSelected = useCallback(() => {
    const nextSelection = selectionFromId(sceneStoreRef.current.currentScene, navigation.selectedId);
    const object = findEntity(sceneStoreRef.current.currentScene, nextSelection)?.entity;
    if (!object?.capabilities?.deletable) {
      setEditFeedback({ tone: 'error', message: '该对象不允许删除' });
      return;
    }
    if (!executeCommand({ type: 'object.delete', objectId: object.id }, `已删除${entityName('object', object)}`)) return;
    commitNavigation({ ...navigation, selectedId: navigation.roomId }, { replace: true, moveCamera: false });
  }, [executeCommand, navigation]);

  const duplicateSelected = () => {
    if (pendingReview) {
      setEditFeedback({ tone: 'warning', message: '请先保留或撤销当前预览，再复制家具。' });
      return;
    }
    if (!selectedObject?.capabilities?.duplicable) {
      setEditFeedback({ tone: 'error', message: '该对象不允许复制' });
      return;
    }
    const startCursor = sceneStoreRef.current.cursor;
    const suffix = (globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)).slice(0, 8);
    const newObjectId = `${selectedObject.id}-copy-${suffix}`;
    const gap = 900;
    const offsets = [
      [selectedObject.dimensions.width + gap, 0],
      [-selectedObject.dimensions.width - gap, 0],
      [0, selectedObject.dimensions.depth + gap],
      [0, -selectedObject.dimensions.depth - gap],
    ];
    const room = currentScene.rooms.find((candidate) => candidate.id === selectedObject.roomId);
    if (room) {
      const xs = room.polygon.map((point) => point.x);
      const zs = room.polygon.map((point) => point.z);
      for (let z = Math.min(...zs) + 700; z <= Math.max(...zs) - 700; z += 500) {
        for (let x = Math.min(...xs) + 700; x <= Math.max(...xs) - 700; x += 500) {
          offsets.push([x - selectedObject.transform.x, z - selectedObject.transform.z]);
        }
      }
    }
    let lastError = null;
    for (const [dx, dz] of offsets) {
      try {
        const beforeEvaluation = evaluateDesignRules(sceneStoreRef.current.currentScene);
        const nextStore = dispatchSceneCommand(sceneStoreRef.current, {
          type: 'object.duplicate',
          objectId: selectedObject.id,
          newObjectId,
          externalId: `${selectedObject.externalId}-COPY-${suffix.toUpperCase()}`,
          transform: { x: selectedObject.transform.x + dx, z: selectedObject.transform.z + dz },
        });
        const afterEvaluation = evaluateDesignRules(nextStore.currentScene);
        const reviewChecks = newReviewChecks(beforeEvaluation, afterEvaluation, [newObjectId]);
        sceneStoreRef.current = nextStore;
        setSceneStore(nextStore);
        setLastRejected(null);
        commitNavigation({ ...navigation, selectedId: newObjectId }, { replace: true, moveCamera: false });
        if (reviewChecks.length) {
          setPendingReview({ checks: reviewChecks.slice(0, 3), startCursor, status: topRuleStatus(reviewChecks) });
          setEditFeedback({ tone: 'warning', message: '已生成复制预览：有规范提醒，保留前请确认代价。' });
        } else {
          setPendingReview(null);
          setEditFeedback({ tone: 'success', message: `已复制${entityName('object', selectedObject)}` });
        }
        return;
      } catch (error) {
        lastError = error;
      }
    }
    setEditFeedback({ tone: 'error', message: `未复制：${lastError ? normalizeEditError(lastError) : '没有合法落位'}` });
    setLastRejected({ message: lastError ? normalizeEditError(lastError) : '当前房间内没有合法复制位置。', source: 'demo' });
  };

  const resizeSelected = () => {
    if (!selectedObject?.capabilities?.parameterEditable || !dimensionDraft) return;
    executeCommand({
      type: 'object.setDimensions',
      objectId: selectedObject.id,
      dimensions: Object.fromEntries(Object.entries(dimensionDraft).map(([key, value]) => [key, Number(value)])),
    }, '尺寸已更新');
  };

  const updateDimensionDraft = (key, value) => {
    setDimensionDraft((current) => ({ ...current, [key]: value }));
  };

  const keepPendingReview = () => {
    if (pendingReview?.saveOnKeep) {
      const beforeHistory = versionHistoryRef.current;
      const nextHistory = saveSceneVersion(beforeHistory, sceneStoreRef.current, { source: pendingReview.versionSource ?? 'agent-local' });
      versionHistoryRef.current = nextHistory;
      setCompareFromVersionId(beforeHistory.currentVersionId);
      setVersionHistory(nextHistory);
      setAgentMessages((messages) => [...messages, {
        id: `agent-saved-${nextHistory.currentVersionId}`,
        role: 'assistant',
        text: `规范提醒已由你保留，当前 Agent 预览已保存为 ${nextHistory.versions.at(-1).label}。`,
        source: pendingReview.versionSource ?? 'agent-local',
        tools: [],
      }]);
    }
    setPendingReview(null);
    setEditFeedback({ tone: 'success', message: '已保留预览；这些提醒会作为 demo 规则边界继续显示。' });
  };

  const discardPendingReview = () => {
    if (!pendingReview) return;
    let nextStore = sceneStoreRef.current;
    const targetCursor = Math.max(0, Math.min(pendingReview.startCursor ?? nextStore.cursor - 1, nextStore.cursor));
    while (nextStore.cursor > targetCursor) nextStore = undoSceneCommand(nextStore);
    sceneStoreRef.current = nextStore;
    setSceneStore(nextStore);
    setPendingReview(null);
    setLastRejected(null);
    if (!selectionFromId(nextStore.currentScene, navigation.selectedId)) {
      commitNavigation({ ...navigation, selectedId: navigation.roomId }, { replace: true, moveCamera: false });
    }
    setEditFeedback({ tone: 'success', message: '已撤销整次预览' });
  };

  const runAgentPrompt = async (rawInput) => {
    const input = String(rawInput ?? '').trim();
    if (!input || agentBusy) return;
    if (pendingReview) {
      setSidecarMode('agent');
      setAgentMessages((messages) => [...messages, {
        id: `agent-review-${Date.now()}`,
        role: 'assistant',
        text: '先保留或撤销当前规范预览，我再继续修改，避免把未确认状态叠在一起。',
        source: 'local',
        tools: [],
      }]);
      return;
    }

    const turnId = globalThis.crypto?.randomUUID?.() ?? `turn-${Date.now()}`;
    setSidecarMode('agent');
    setAgentInput('');
    setAgentBusy(true);
    setAgentMessages((messages) => [...messages, { id: `${turnId}-user`, role: 'user', text: input, source: 'resident', tools: [] }]);
    const beforeStore = sceneStoreRef.current;
    const beforeHistory = versionHistoryRef.current;

    try {
      const result = await runAgentTurn({
        store: beforeStore,
        input,
        selectedObjectId: navigation.selectedId,
        versionHistory: beforeHistory,
      });
      const sceneChanged = serializeScene(result.store.currentScene) !== serializeScene(beforeStore.currentScene);
      const successfulWrites = result.trace.steps.filter((step) => step.ok && agentWriteTools.has(step.tool));
      let savedLabel = null;
      let needsReview = false;

      if (sceneChanged) {
        const beforeEvaluation = evaluateDesignRules(beforeStore.currentScene);
        const afterEvaluation = evaluateDesignRules(result.store.currentScene);
        const affectedObjectIds = result.trace.toolCalls.map((call) => call.args?.objectId).filter(Boolean);
        const reviewChecks = newReviewChecks(beforeEvaluation, afterEvaluation, affectedObjectIds);
        sceneStoreRef.current = result.store;
        setSceneStore(result.store);
        setLastRejected(null);

        if (reviewChecks.length) {
          needsReview = true;
          setPendingReview({
            checks: reviewChecks.slice(0, 3),
            saveOnKeep: true,
            startCursor: beforeStore.cursor,
            status: topRuleStatus(reviewChecks),
            versionSource: result.trace.source === 'provider' ? 'aily' : 'agent-local',
          });
          setEditFeedback({ tone: 'warning', message: 'Agent 已生成待确认预览；保留后才写入版本链。' });
        } else {
          const nextHistory = saveSceneVersion(beforeHistory, result.store, { source: result.trace.source === 'provider' ? 'aily' : 'agent-local' });
          versionHistoryRef.current = nextHistory;
          setCompareFromVersionId(beforeHistory.currentVersionId);
          setVersionHistory(nextHistory);
          savedLabel = nextHistory.versions.at(-1).label;
          setEditFeedback({ tone: 'success', message: `Agent 修改已保存为 ${savedLabel}` });
        }

        const deletedSelected = successfulWrites.some((step) => step.tool === 'delete_object' && step.args?.objectId === navigation.selectedId);
        if (deletedSelected) commitNavigation({ ...navigation, selectedId: navigation.roomId }, { replace: true, moveCamera: false });
      } else if (result.trace.rolledBack) {
        const failed = result.trace.steps.find((step) => !step.ok);
        const message = normalizeEditError(new Error(failed?.error ?? '规则未通过'));
        setLastRejected({ message, source: 'demo' });
        setEditFeedback({ tone: 'error', message: `Agent 未写入：${message}` });
      }

      setAgentMessages((messages) => [...messages, {
        id: `${turnId}-assistant`,
        role: 'assistant',
        text: agentReplyFromTrace(result.trace, { savedLabel, pending: needsReview }),
        source: result.trace.source,
        fallbackReason: result.trace.fallbackReason,
        tools: result.trace.toolCalls.map((call) => call.tool),
        confirmationRequested: result.trace.steps.some((step) => step.ok && step.tool === 'request_confirmation'),
      }]);
    } catch {
      setAgentMessages((messages) => [...messages, {
        id: `${turnId}-assistant`,
        role: 'assistant',
        text: 'Agent 本轮没有完成，场景保持原样。你可以重试，或继续用右侧手动工具编辑。',
        source: 'local',
        tools: [],
      }]);
    } finally {
      setAgentBusy(false);
    }
  };

  const submitAgentPrompt = (event) => {
    event.preventDefault();
    runAgentPrompt(agentInput);
  };

  const saveCurrentVersion = () => {
    if (pendingReview) {
      setEditFeedback({ tone: 'warning', message: '请先保留或撤销规范预览，再保存版本。' });
      return;
    }
    const nextHistory = saveSceneVersion(versionHistory, sceneStoreRef.current, { source: 'manual' });
    if (nextHistory === versionHistory) {
      setEditFeedback({ tone: 'neutral', message: `${currentVersion.label} 已包含当前场景，无需重复保存。` });
      return;
    }
    setCompareFromVersionId(currentVersion.id);
    setVersionHistory(nextHistory);
    const saved = nextHistory.versions.at(-1);
    setEditFeedback({ tone: 'success', message: `${saved.label} 已保存；可与 ${currentVersion.label} 对比或回退。` });
  };

  const confirmCurrentVersion = () => {
    if (pendingReview || hasUnsavedChanges) {
      setEditFeedback({ tone: 'warning', message: pendingReview ? '请先处理规范预览。' : '请先保存当前修改，再确认版本。' });
      return;
    }
    const nextHistory = confirmSceneVersion(versionHistory, currentVersion.id);
    setVersionHistory(nextHistory);
    setCompareFromVersionId(currentVersion.id);
    setEditFeedback({ tone: 'success', message: `${currentVersion.label} 已客户确认；后续保存会标记为确认后修改。` });
  };

  const restoreComparedVersion = () => {
    if (hasUnsavedChanges || pendingReview) {
      setEditFeedback({ tone: 'warning', message: hasUnsavedChanges ? '请先保存或撤销当前修改，再从旧版继续。' : '请先处理规范预览。' });
      return;
    }
    const restored = restoreSceneVersion(versionHistory, compareFromVersion.id);
    sceneStoreRef.current = restored.store;
    setSceneStore(restored.store);
    setVersionHistory(restored.history);
    setPendingReview(null);
    setLastRejected(null);
    const restoredVersion = restored.history.versions.at(-1);
    setEditFeedback({ tone: 'success', message: restoredVersion.id === compareFromVersion.id
      ? `当前就是 ${compareFromVersion.label}。`
      : `已从 ${compareFromVersion.label} 创建 ${restoredVersion.label}，原版本链保持不变。` });
  };

  useEffect(() => {
    if (!selectedObject) return;
    if (editMode === 'move' && !selectedObject.capabilities.movable) setEditMode(selectedObject.capabilities.rotatable ? 'rotate' : null);
    if (editMode === 'rotate' && !selectedObject.capabilities.rotatable) setEditMode(selectedObject.capabilities.movable ? 'move' : null);
  }, [editMode, selectedObject]);

  useEffect(() => {
    setDimensionDraft(selectedObject ? { ...selectedObject.dimensions } : null);
  }, [selectedObject?.id, selectedObject?.dimensions]);

  useEffect(() => { setLastRejected(null); }, [navigation.selectedId]);

  useEffect(() => {
    if (!versions.some((version) => version.id === compareFromVersionId)) setCompareFromVersionId(versions[0].id);
  }, [compareFromVersionId, versions]);

  useEffect(() => {
    try { window.localStorage.setItem(VERSION_STORAGE_KEY, serializeVersionHistory(versionHistory)); }
    catch { /* Offline cache failure must not block the live editing session. */ }
  }, [versionHistory]);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/health', { signal: controller.signal })
      .then((response) => {
        if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('HEALTH_UNAVAILABLE');
        return response.json();
      })
      .then((health) => setAgentCapability({
        aily: health.aily?.status ?? health.aily ?? 'api_unavailable',
        base: health.base?.status ?? health.base ?? 'api_unavailable',
        provider: health.provider ?? 'local',
      }))
      .catch((error) => {
        if (error.name !== 'AbortError') setAgentCapability({ aily: 'api_unavailable', base: 'api_unavailable', provider: 'local' });
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const list = agentMessageListRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [agentBusy, agentMessages]);

  useEffect(() => {
    if (!versionDrawerOpen) return undefined;
    const closeOnEscape = (event) => { if (event.key === 'Escape') setVersionDrawerOpen(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [versionDrawerOpen]);

  useEffect(() => {
    const handleEditShortcut = (event) => {
      if (versionDrawerOpen) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      const modifier = event.metaKey || event.ctrlKey;
      if (modifier && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        deleteSelected();
        return;
      }
      const directions = { ArrowUp: [0, -100], ArrowDown: [0, 100], ArrowLeft: [-100, 0], ArrowRight: [100, 0] };
      if (directions[event.key]) {
        event.preventDefault();
        moveSelected(...directions[event.key]);
      }
    };
    window.addEventListener('keydown', handleEditShortcut);
    return () => window.removeEventListener('keydown', handleEditShortcut);
  }, [deleteSelected, moveSelected, redo, undo, versionDrawerOpen]);

  return <main className="product-shell project-demo" data-room-id={displayRoomId ?? ''} data-selected-id={displaySelectedId ?? ''}>
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
        <button className="utility-button" data-testid="open-version-drawer" type="button" onClick={() => setVersionDrawerOpen(true)}><ClockCounterClockwise size={15} aria-hidden="true" />{currentVersion.label}{hasUnsavedChanges ? ' · 未保存' : ''}</button>
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
          scene={currentScene}
          selection={selection}
          onSelect={selectEntity}
          editMode={pendingReview ? 'select' : editMode}
          onEditCommand={(command) => Boolean(executeCommand(command))}
          onNavigate={({ selection: nextSelection, presetId, reason }) => {
            if (reason === 'room' && nextSelection?.kind === 'room') jumpToRoom(nextSelection.id);
            else jumpToRoomView(presetId);
          }}
          activeRoomId={displayRoomId}
          roomLabels={roomLabels}
          onStats={setRenderStats}
          onLoadState={setAssetLoadState}
          viewRequest={viewRequest}
          versionComparison={versionComparison}
          onViewEvent={({ phase, preset }) => {
            if (phase !== 'done') return;
            setDisplayViewId(preset.id);
            setDisplaySelectedId(navigation.selectedId);
            if (preset.kind !== 'free') setDisplayRoomId(preset.roomId ?? null);
          }}
          showHomeView={false}
        />
      </section>

      <aside className="project-sidebar" data-mode={sidecarMode}>
        <nav className="project-sidebar__switch" aria-label="右侧工作区">
          <button type="button" aria-pressed={sidecarMode === 'space'} onClick={() => setSidecarMode('space')}><Cube size={15} />空间</button>
          <button type="button" aria-pressed={sidecarMode === 'agent'} onClick={() => setSidecarMode('agent')}><ChatCircleDots size={15} />Agent</button>
        </nav>
        {sidecarMode === 'space' ? <>
        <article className="panel project-panel project-panel--overview">
          <div className="panel__header">
            <div>
              <p className="panel__kicker">2D 同步总览</p>
              <h2 className="panel__title">当前户型与布置</h2>
            </div>
            <span className="panel__meta">点击空间进入俯视</span>
          </div>
          <div className="project-overview" data-testid="overview-2d">
            <ScenePlan sceneModel={currentScene} mode="overlay" selection={selection} onSelect={navigateFromPlan} showModeRail={false} compact />
          </div>
        </article>

        <article className="panel project-panel project-context" aria-label="当前位置摘要">
          <div className="project-context__lead"><span className="live-dot" /><div><span>当前位置</span><strong>{currentRoomLabel}</strong></div></div>
          <dl className="project-context__facts"><div><dt>视角</dt><dd>{currentViewLabel}</dd></div><div><dt>选择</dt><dd>{selectedLabel}</dd></div></dl>
          <div className="project-edit__history" aria-label="编辑历史">
            <button type="button" onClick={undo} disabled={sceneStore.cursor === 0} title="撤销 (Cmd/Ctrl+Z)">撤销</button>
            <button type="button" onClick={redo} disabled={sceneStore.cursor === sceneStore.commands.length} title="重做 (Shift+Cmd/Ctrl+Z)">重做</button>
            <span className="project-edit__feedback" data-tone={editFeedback.tone} aria-live="polite">{editFeedback.message}</span>
          </div>
          {pendingReview && <div className="project-review" data-status={pendingReview.status} data-testid="pending-rule-review">
            <div>
              <strong>{pendingReview.status === 'warning' ? '规范提醒待确认' : '舒适建议待确认'}</strong>
              <span>source: demo · 仅为演示规则，真实落地需欧派/施工 API 复核</span>
            </div>
            <ul>
              {pendingReview.checks.map((check) => <li key={ruleReviewKey(check)}><span>{check.message}</span>{check.suggestion && <small>可这样调整：{check.suggestion}</small>}</li>)}
            </ul>
            <div>
              <button type="button" onClick={keepPendingReview}>保留此预览</button>
              <button type="button" onClick={discardPendingReview}>撤销预览</button>
            </div>
          </div>}
          {selectedObject && <div className="project-object" data-testid="selected-object-details">
            <div><span>{selectedObject.externalId}</span><strong>{selectedObject.source === 'demo' ? '演示对象' : '企业对象'}</strong></div>
            <dl>
              <div><dt>尺寸</dt><dd>{selectedObject.dimensions.width} × {selectedObject.dimensions.depth} × {selectedObject.dimensions.height} mm</dd></div>
              <div><dt>能力</dt><dd>{selectedObject.capabilities.movable ? '可移动 / 可旋转' : '固定构件'}</dd></div>
            </dl>
            <div className="project-edit" aria-label={`${entityName('object', selectedObject)}编辑工具`}>
              {(selectedObject.capabilities.movable || selectedObject.capabilities.rotatable) && <div className="project-edit__modes" aria-label="编辑模式">
                {selectedObject.capabilities.movable && <button type="button" aria-pressed={editMode === 'move'} onClick={() => setEditMode('move')}>移动</button>}
                {selectedObject.capabilities.rotatable && <button type="button" aria-pressed={editMode === 'rotate'} onClick={() => setEditMode('rotate')}>旋转</button>}
              </div>}
              {selectedObject.capabilities.movable && <div className="project-edit__nudge" aria-label="每次移动 100 毫米">
                <button type="button" aria-label="向北移动 100 毫米" onClick={() => moveSelected(0, -100)}>↑</button>
                <button type="button" aria-label="向西移动 100 毫米" onClick={() => moveSelected(-100, 0)}>←</button>
                <span>100 mm</span>
                <button type="button" aria-label="向东移动 100 毫米" onClick={() => moveSelected(100, 0)}>→</button>
                <button type="button" aria-label="向南移动 100 毫米" onClick={() => moveSelected(0, 100)}>↓</button>
              </div>}
              {selectedObject.capabilities.rotatable && <button className="project-edit__rotate" type="button" onClick={rotateSelected}>顺时针 15°</button>}
              {selectedObject.capabilities.materialEditable && <div className="project-edit__materials" aria-label="材质">
                <span>材质</span>
                {currentScene.materials.filter((material) => materialLabels[material.id]).map((material) => <button key={material.id} type="button" aria-label={`切换为${materialLabels[material.id]}`} aria-pressed={selectedObject.materialId === material.id} onClick={() => executeCommand({ type: 'object.setMaterial', objectId: selectedObject.id, materialId: material.id }, `已切换为${materialLabels[material.id]}`)}><i style={{ background: material.color }} />{materialLabels[material.id]}</button>)}
              </div>}
              {selectedObject.capabilities.parameterEditable && dimensionDraft && <form className="project-edit__dimensions" onSubmit={(event) => { event.preventDefault(); resizeSelected(); }}>
                {Object.entries({ width: '宽', depth: '深', height: '高' }).map(([key, label]) => <label key={key}><span>{label}</span><input aria-label={`${label}度，毫米`} type="number" min="1" step="10" value={dimensionDraft[key]} onInput={(event) => updateDimensionDraft(key, event.currentTarget.value)} onChange={(event) => updateDimensionDraft(key, event.currentTarget.value)} /></label>)}
                <button type="button" onClick={resizeSelected}>应用尺寸</button>
              </form>}
              {(selectedObject.capabilities.deletable || selectedObject.capabilities.duplicable) && <div className="project-edit__object-actions">
                {selectedObject.capabilities.duplicable && <button type="button" onClick={duplicateSelected}>复制</button>}
                {selectedObject.capabilities.deletable && <button type="button" onClick={deleteSelected}>删除</button>}
              </div>}
            </div>
          </div>}
          <div className="project-rules" aria-label="设计规则检查">
            <div className="project-rules__header"><span>规则检查</span><strong data-status={lastRejected ? 'blocked' : designEvaluation.status}>{lastRejected ? '刚才已阻止' : (ruleStatusLabels[designEvaluation.status] ?? designEvaluation.status)}</strong></div>
            <p className="project-rules__scope">适用边界：当前合成演示户型 · source: demo；真实欧派 / 施工规范待企业 API 复核。</p>
            <ul>
              {lastRejected && <li data-status="blocked"><span>未写入</span><p>{lastRejected.message}</p><small>刚才尝试没有改变 2D / 3D 场景 · source: {lastRejected.source}</small></li>}
              {visibleRuleChecks.map((check) => <li key={`${check.code}-${check.ruleId}-${check.objectIds.join('-')}`} data-status={check.status}>
                <span>{ruleStatusLabels[check.status] ?? check.status}</span>
                <p>{check.message}</p>
                {check.suggestion && <small>可这样调整：{check.suggestion}</small>}
                {check.applicability && <small>适用边界：{check.applicability} · source: {check.source}</small>}
              </li>)}
            </ul>
          </div>
          <dl className="project-metrics" aria-label="三维运行实测">
            <div><dt>FPS</dt><dd>{renderStats.fps || '—'}</dd></div>
            <div><dt>Draw</dt><dd>{renderStats.calls || '—'}</dd></div>
            <div><dt>Triangles</dt><dd>{renderStats.triangles ? renderStats.triangles.toLocaleString() : '—'}</dd></div>
            <div><dt>GLB</dt><dd>{assetLoadState.completed}/{assetLoadState.total}{assetLoadState.failed ? ` · ${assetLoadState.failed} 占位` : ''}</dd></div>
          </dl>
          <p>{displaySelectedEntity?.kind === 'object'
            ? '已定位到所选家具；可在三维画布或右侧工具中编辑，规则不通过时不会写入 scene。'
            : (displayRoomId ? '使用画布底部的视角胶囊切换俯视、入口与主功能面；选择对象不会因切换镜头而丢失。' : '从 3D 房间地面或右侧 2D 户型选择空间，镜头会先进入三维俯视。')}</p>
        </article>
        </> : <article className="panel agent-sidecar" data-testid="agent-sidecar">
          <header className="agent-sidecar__header">
            <div className="agent-sidecar__identity"><span><Sparkle size={16} aria-hidden="true" /></span><div><strong>AI 设计协同</strong><small>{agentCapability.provider === 'local' ? '本地规划器' : agentCapability.provider}</small></div></div>
            <div className="agent-sidecar__capability" data-status={agentCapability.aily === 'ready' ? 'ready' : 'fallback'}><i />{agentCapability.aily === 'ready' ? 'Aily 可用' : '本地降级'}</div>
          </header>

          <div className="agent-sidecar__scope">
            <span>当前上下文</span><strong>{currentRoomLabel} · {selectedLabel}</strong>
            <small>Aily: {agentCapability.aily} · Base: {agentCapability.base}</small>
          </div>

          <div className="agent-quick" aria-label="快速真实任务">
            {agentQuickPrompts.map((prompt) => <button key={prompt} type="button" onClick={() => runAgentPrompt(prompt)} disabled={agentBusy || Boolean(pendingReview)}>{prompt}</button>)}
          </div>

          <div className="agent-messages" ref={agentMessageListRef} aria-live="polite" aria-label="Agent 对话">
            {agentMessages.map((message) => <article key={message.id} className="agent-message" data-role={message.role}>
              <div className="agent-message__meta"><span>{message.role === 'user' ? '你' : 'Agent'}</span>{message.role === 'assistant' && <small>{message.source === 'provider' ? 'AILY' : 'LOCAL'}{message.fallbackReason ? ` · ${message.fallbackReason}` : ''}</small>}</div>
              <p>{message.text}</p>
              {message.tools?.length > 0 && <div className="agent-message__tools">{message.tools.map((tool) => <span key={tool}>{agentToolLabels[tool] ?? tool}</span>)}</div>}
              {message.confirmationRequested && <button className="agent-message__action" type="button" onClick={() => setVersionDrawerOpen(true)}>查看版本并由我确认</button>}
            </article>)}
            {agentBusy && <article className="agent-message" data-role="assistant" data-busy="true"><div className="agent-message__meta"><span>Agent</span><small>LOCAL</small></div><p>正在读取当前 scene、版本和规则…</p></article>}
          </div>

          {pendingReview && <div className="agent-review" data-status={pendingReview.status}>
            <strong>{pendingReview.status === 'warning' ? '规范提醒待确认' : '舒适建议待确认'}</strong>
            <p>{pendingReview.checks[0]?.message}</p>
            <div><button type="button" onClick={keepPendingReview}>保留并保存</button><button type="button" onClick={discardPendingReview}>撤销预览</button></div>
          </div>}

          <form className="agent-composer" onSubmit={submitAgentPrompt}>
            <textarea rows="3" maxLength="4000" aria-label="告诉 Agent 你的设计需求" placeholder={`试试：${agentTargetLabel}向右移动20厘米`} value={agentInput} onChange={(event) => setAgentInput(event.currentTarget.value)} disabled={agentBusy} />
            <button type="submit" aria-label="发送给 Agent" disabled={agentBusy || !agentInput.trim() || Boolean(pendingReview)}><PaperPlaneTilt size={17} aria-hidden="true" /></button>
          </form>
          <footer className="agent-sidecar__footer">工具调用 → 确定性规则 → SceneCommand → 版本；Agent 不直接写 geometry JSON，也不会代你确认。</footer>
        </article>}
      </aside>
    </section>
    {versionDrawerOpen && <div className="version-layer">
      <button className="version-layer__scrim" type="button" aria-label="关闭版本与影响" onClick={() => setVersionDrawerOpen(false)} />
      <aside className="version-drawer" role="dialog" aria-modal="true" aria-labelledby="version-drawer-title" data-testid="version-impact-drawer">
        <header className="version-drawer__header">
          <div><p className="panel__kicker">同一 scene · 可回放</p><h2 id="version-drawer-title">版本与影响</h2></div>
          <button type="button" aria-label="关闭版本与影响" onClick={() => setVersionDrawerOpen(false)}><X size={18} /></button>
        </header>

        <section className="version-current" data-status={currentVersionStatus}>
          <div><span>当前工作状态</span><strong>{currentVersion.label} · {versionStatusLabels[currentVersionStatus]}</strong></div>
          <p>{hasUnsavedChanges ? '当前 2D / 3D 有尚未进入版本链的真实修改。' : `已保存 ${currentVersion.summary.commandCount} 条命令，快照可由 SceneCommand 完整重建。`}</p>
          <div className="version-current__actions">
            <button type="button" onClick={saveCurrentVersion} disabled={!hasUnsavedChanges || Boolean(pendingReview)}><FloppyDisk size={15} />保存为 V{versions.length + 1}</button>
            <button type="button" onClick={confirmCurrentVersion} disabled={hasUnsavedChanges || Boolean(pendingReview) || currentVersion.status === 'customer_confirmed'}><Check size={15} />客户确认</button>
          </div>
        </section>

        <section className="version-section" aria-labelledby="version-timeline-title">
          <div className="version-section__title"><div><span>版本时间线</span><strong id="version-timeline-title">{versions.length} 个可重建节点</strong></div><small>offline cache</small></div>
          <div className="version-timeline" aria-label="设计版本">
            {[...versions].reverse().map((version) => <button key={version.id} type="button" aria-pressed={compareFromVersion.id === version.id} data-status={version.status} onClick={() => setCompareFromVersionId(version.id)}>
              <span className="version-timeline__rail" aria-hidden="true" />
              <span className="version-timeline__body"><strong>{version.label}</strong><small>{versionStatusLabels[version.status]} · {version.source}</small></span>
              <time dateTime={version.createdAt}>{new Date(version.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</time>
            </button>)}
          </div>
        </section>

        <section className="version-section version-compare" aria-labelledby="version-compare-title">
          <div className="version-section__title">
            <div><span>真实差异</span><strong id="version-compare-title">{compareFromVersion.label} → {hasUnsavedChanges ? '未保存场景' : currentVersion.label}</strong></div>
            <label>基准<select value={compareFromVersion.id} onChange={(event) => setCompareFromVersionId(event.currentTarget.value)}>{versions.map((version) => <option key={version.id} value={version.id}>{version.label}</option>)}</select></label>
          </div>
          <ul className="version-diff" aria-label="版本差异">
            {namedDiffs.length
              ? namedDiffs.map((diff, index) => <li key={`${diff.kind}-${diff.objectId}-${index}`}><span>{diffKindLabels[diff.kind]}</span><p>{diff.label}</p></li>)
              : <li><span>无变化</span><p>基准版与当前场景完全一致</p></li>}
          </ul>
          <dl className="version-impact" aria-label="影响摘要">
            <div><dt>规则状态</dt><dd>{ruleStatusLabels[versionDiff.impact.status] ?? versionDiff.impact.status}</dd></div>
            <div><dt>对象差异</dt><dd>{versionDiff.objectDiffs.length}</dd></div>
            <div><dt>规则变化</dt><dd>{versionDiff.ruleDiffs.length}</dd></div>
            <div><dt>未决项</dt><dd>{versionDiff.impact.unresolved.length}</dd></div>
          </dl>
          {versionDiff.impact.unresolved.length > 0 && <div className="version-unresolved"><strong>仍不能确定</strong>{versionDiff.impact.unresolved.slice(0, 3).map((item) => <p key={`${item.code}-${item.objectId ?? ''}`}>{item.reason}<small>source: {item.source ?? 'estimate'}</small></p>)}</div>}
          <button className="version-restore" type="button" onClick={restoreComparedVersion} disabled={compareFromVersion.id === currentVersion.id || hasUnsavedChanges || Boolean(pendingReview)}><ClockCounterClockwise size={15} />以 {compareFromVersion.label} 继续，创建新版本</button>
        </section>
      </aside>
    </div>}
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
