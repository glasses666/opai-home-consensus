import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Armchair, ChatCircleDots, Check, ClockCounterClockwise, Cube, FloppyDisk, HouseLine, MapTrifold, PaperPlaneTilt, Sparkle, StackSimple, UsersThree, X } from '@phosphor-icons/react';
import { runAgentTurn, TOOL_REGISTRY } from './agent/harness.js';
import { createDemoScene } from './domain/demo-scene.js';
import { createDesignBrief, deserializeDesignBrief, normalizeDesignBrief, serializeDesignBrief } from './domain/design-brief.js';
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
import { evaluateDesignRules, filterDesignRuleChecksForRoom } from './domain/design-rules.js';
import { buildDesignerReview, buildHandoffPacket } from './domain/handoff.js';
import {
  addHouseholdOpinion,
  chooseConsensusDirection,
  confirmConsensusVersion,
  createDemoHouseholdConsensus,
  deserializeHouseholdConsensus,
  detectHouseholdConflicts,
  serializeHouseholdConsensus,
  setConflictDirections,
} from './domain/household-consensus.js';
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
import { resolveRenderProfile } from './domain/render-profile.js';

const PascalStage = lazy(() => import('./PascalStage.jsx'));
const Scene3D = lazy(() => import('./Scene3D.jsx'));

const scene = createSceneStore(createDemoScene()).currentScene;
const serialized = serializeScene(scene);
const serializedBytes = new TextEncoder().encode(serialized).length;
const roundTripMatches = serializeScene(deserializeScene(serialized)) === serialized;

const capabilityLabel = (status, name) => {
  if (status === 'ready') return `${name} 已连接`;
  if (status === 'missing_scope') return `${name} 待授权`;
  if (status === 'auth_failed') return `${name} 授权失效`;
  return `${name} 未连接`;
};

const roomLabels = {
  'room-primary-bedroom': '主卧',
  'room-bathroom': '卫生间',
  'room-flex': '儿童房 / 书房',
  'room-hall': '过厅',
  'room-living-dining': '开放客餐厅',
  'room-kitchen': '厨房',
  'room-entry': '玄关',
};

const roomLabelPositions = {
  'room-primary-bedroom': { x: 2850, y: 2750 },
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
  'object-flex-floating-shelf': '悬浮层板',
  'object-living-slat-partition': '格栅隔断',
  'object-primary-feature-wall': '主卧背景墙',
};

const materialLabels = {
  'mat-ceiling-greige': '暖灰顶面',
  'mat-ceiling-warm-white': '暖白顶面',
  'mat-door-warm-white': '暖白',
  'mat-fabric-warm-gray': '暖灰织物',
  'mat-floor-light-oak': '浅橡木地板',
  'mat-floor-tile-warm': '暖灰哑光砖',
  'mat-oak-veneer': '浅橡木',
  'mat-object-warm-white': '暖白家具饰面',
  'mat-wall-greige': '暖灰墙面',
  'mat-wall-oak-panel': '浅橡木墙板',
  'mat-wall-warm-white': '暖白墙面',
};
const surfaceKindLabels = { wall: '墙面', floor: '地面', ceiling: '顶面' };
const wallDirectionLabels = { north: '北墙', south: '南墙', east: '东墙', west: '西墙' };
const surfaceLabelOverrides = {
  'surface-wall-living-east-kitchen': '东墙 · 厨房侧',
  'surface-wall-living-east-entry': '东墙 · 玄关侧',
};
const roomBriefs = {
  'room-living-dining': {
    kicker: '开放客餐厅任务',
    title: '会客、用餐与固定系统同场协作',
    summary: '家具、电视柜、格栅隔断与墙地顶饰面都来自同一 scene，并共享碰撞、净距与版本记录。',
    checks: ['主通道 ≥ 900 mm', '固定构件需复核', '模型槽可替换'],
    shortcuts: [
      { label: '沙发', objectId: 'object-sofa' },
      { label: '餐桌', objectId: 'object-dining-table' },
      { label: '电视柜', objectId: 'object-tv-console' },
      { label: '格栅隔断', objectId: 'object-living-slat-partition' },
    ],
  },
  'room-primary-bedroom': {
    kicker: '主卧设计任务',
    title: '睡眠与收纳互不让步',
    summary: '同一 4.0 × 3.2 m 房间里，同时保护床侧通行、衣柜使用和入门开启。',
    checks: ['床侧 ≥ 600 mm', '柜前 ≥ 900 mm', '门扇可开启'],
    shortcuts: [
      { label: '床', objectId: 'object-primary-bed' },
      { label: '衣柜', objectId: 'object-primary-wardrobe' },
      { label: '背景墙', objectId: 'object-primary-feature-wall' },
    ],
  },
  'room-flex': {
    kicker: '成长型儿童房任务',
    title: '学习、活动与未来换床',
    summary: '同一 4.6 × 3.2 m 房间里，先保留床侧与活动留白；床和书桌的每次调整都进入规则与版本。',
    checks: ['床侧 ≥ 600 mm', '成长活动留白 1.6 m', '加宽床须复核活动区'],
    shortcuts: [
      { label: '单人床', objectId: 'object-flex-bed' },
      { label: '书桌', objectId: 'object-flex-desk' },
      { label: '悬浮层板', objectId: 'object-flex-floating-shelf' },
    ],
  },
};
const versionStatusLabels = {
  drafting: '草拟中',
  impact_review: '待影响确认',
  customer_confirmed: '已确认',
  changed_after_confirm: '确认后修改',
  designer_verified: '设计师已复核',
  designer_returned: '设计师退回',
};
const diffKindLabels = {
  added: '新增',
  deleted: '删除',
  transform: '位置 / 旋转',
  dimensions: '尺寸',
  material: '材质',
  model: '3D 模型',
  placement: '安装位置',
  collision: '碰撞代理',
  review: '专业复核',
};
const objectLayerLabels = { fixed_installation: '固定安装', furniture: '家具', equipment: '设备', service: '点位' };
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
  [/SURFACE_MATERIAL_LOCKED/, '这个表面的饰面由当前方案锁定，不能直接更换。'],
  [/SURFACE_MATERIAL_INCOMPATIBLE/, '这种材质不适用于当前表面，请改选同类饰面。'],
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
const reviewTitle = (status) => status === 'passed' ? 'Agent 方案待确认' : status === 'warning' ? '规范提醒待确认' : '舒适建议待确认';
const PROJECT_ID = 'project-demo';
const VERSION_STORAGE_KEY = 'oppein.project-demo.versions.v3';
const CONSENSUS_STORAGE_KEY = 'oppein.project-demo.household.v3';
const DESIGN_BRIEF_STORAGE_KEY = 'oppein.project-demo.design-brief.v1';
const opinionStanceLabels = {
  support: '支持',
  oppose: '反对',
  supplement: '补充',
  non_negotiable: '不可妥协',
};
const memberRoleLabels = { owner: '主决策人', co_decider: '共同决策', resident: '长期居住' };
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
const downstreamLabels = {
  skuMapping: '产品与 SKU 映射',
  pricing: '报价与估算',
  bom: 'BOM 预览',
  production: '生产下发',
};
const downstreamValueLabels = {
  pending_enterprise_catalog: '等待欧派企业产品目录',
  pending_overseas_quote_or_estimate_api: '等待海外报价或估算接口',
  pending_bom_preview_api: '等待 BOM 预览接口',
  not_connected_in_v1: 'V1 暂不连接生产系统',
};

async function fetchJson(path, options) {
  const response = await fetch(path, options);
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(body.error ?? `HTTP_${response.status}`);
  return body;
}

const eventId = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const agentReplyFromTrace = (trace, { savedLabel = null, pending = false } = {}) => {
  const failed = trace.steps.find((step) => !step.ok);
  if (trace.rolledBack || failed) {
    const reason = normalizeEditError(new Error(failed?.error ?? '规则未通过')).replace(/[。！？!?]+$/, '');
    return `场景未写入：${reason}。调整距离或方向后重试。`;
  }
  const clarification = trace.steps.find((step) => step.tool === 'request_clarification' && step.ok)?.result;
  if (clarification?.question) return clarification.question;
  const confirmation = trace.steps.find((step) => step.tool === 'request_confirmation' && step.ok)?.result;
  if (confirmation?.message) return confirmation.message;
  const comparison = trace.steps.find((step) => step.tool === 'compare_versions' && step.ok)?.result;
  if (comparison) return `版本比较：${comparison.objectDiffs?.length ?? 0} 项对象变化，${comparison.surfaceDiffs?.length ?? 0} 项饰面变化，${comparison.ruleDiffs?.length ?? 0} 项规则变化，${comparison.impact?.unresolved?.length ?? 0} 项待确认。`;
  const writes = trace.steps.filter((step) => step.ok && agentWriteTools.has(step.tool));
  if (writes.length) {
    if (trace.assistantReply) return trace.assistantReply;
    const actions = [...new Set(writes.map((step) => agentToolLabels[step.tool] ?? step.tool))].join('、');
    if (pending) return `已生成${actions}预览；有 demo 规范提醒，请先保留或撤销，再进入版本链。`;
    return `已完成${actions}，确定性规则已检查${savedLabel ? `，并保存为 ${savedLabel}` : ''}。`;
  }
  return trace.assistantReply || '当前场景已读取；2D / 3D 未修改。';
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

const createInitialHouseholdProject = (history) => {
  const fallback = createDemoHouseholdConsensus(history.currentVersionId);
  if (typeof window === 'undefined') return fallback;
  try {
    const serialized = window.localStorage.getItem(CONSENSUS_STORAGE_KEY);
    if (!serialized) return fallback;
    const restored = deserializeHouseholdConsensus(serialized);
    const versionIds = new Set(history.versions.map((version) => version.id));
    const referenced = [
      restored.currentVersionId,
      ...restored.opinions.map((opinion) => opinion.versionId),
      ...restored.directions.map((direction) => direction.versionId),
      restored.finalDecision?.versionId,
      restored.finalDecision?.baseVersionId,
      ...restored.confirmations.map((confirmation) => confirmation.versionId),
    ].filter(Boolean);
    if (referenced.some((versionId) => !versionIds.has(versionId))) throw new Error('CONSENSUS_VERSION_NOT_FOUND');
    return restored;
  } catch {
    window.localStorage.removeItem(CONSENSUS_STORAGE_KEY);
    return fallback;
  }
};

const createInitialDesignBrief = () => {
  if (typeof window === 'undefined') return createDesignBrief();
  try {
    const serialized = window.localStorage.getItem(DESIGN_BRIEF_STORAGE_KEY);
    return serialized ? deserializeDesignBrief(serialized) : createDesignBrief();
  } catch {
    window.localStorage.removeItem(DESIGN_BRIEF_STORAGE_KEY);
    return createDesignBrief();
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
  if (kind === 'surface') {
    if (surfaceLabelOverrides[entity.id]) return surfaceLabelOverrides[entity.id];
    if (entity.kind !== 'wall') return surfaceKindLabels[entity.kind] ?? entity.id;
    const direction = Object.keys(wallDirectionLabels).find((value) => entity.id.includes(`-${value}`));
    return direction ? wallDirectionLabels[direction] : '墙面';
  }
  return entity.kind ?? entity.id;
}

function Inspector({ sceneModel, selection, onNavigate, mode, workspaceMode, renderStats }) {
  const selected = findEntity(sceneModel, selection);
  return <aside className="panel inspector" aria-label="Canonical entity inspector">
    <div className="panel__header"><div><p className="panel__kicker">Selection map</p><h2 className="panel__title">对象与房间</h2></div><span className="panel__meta">{workspaceMode === '3d' ? '实时 3D' : modeOptions.find((item) => item.id === mode)?.label}</span></div>
    <div className="inspector__content">
      {workspaceMode === '3d' && <dl className="render-stats" aria-label="3D rendering statistics"><div><dt>FPS</dt><dd>{renderStats.fps || '—'}</dd></div><div><dt>Draw calls</dt><dd>{renderStats.calls || '—'}</dd></div><div><dt>Triangles</dt><dd>{renderStats.triangles ? renderStats.triangles.toLocaleString() : '—'}</dd></div><div><dt>GLB</dt><dd>{renderStats.assets || sceneModel.objects.length}</dd></div></dl>}
      <ul className="entity-list">{sceneModel.rooms.map((room) => {
        const groups = Object.entries(objectLayerLabels)
          .map(([layer, label]) => ({ layer, label, objects: sceneModel.objects.filter((object) => object.roomId === room.id && object.hierarchy.layer === layer) }))
          .filter((group) => group.objects.length);
        return <li className="entity-list__room" key={room.id}>
          <button className="entity-list__room-button" type="button" aria-pressed={selection?.kind === 'room' && selection.id === room.id} onClick={() => onNavigate({ kind: 'room', id: room.id }, room.cameraPresetIds[0])}><span>{entityName('room', room)}</span><span className="entity-list__type">俯视</span></button>
          {groups.map((group) => <section className="entity-list__group" key={group.layer} aria-label={group.label}>
            <span>{group.label}</span>
            <ul className="entity-list__objects">{group.objects.map((object) => {
              const preset = objectNavigationPreset(sceneModel, object);
              return <li key={object.id}><button type="button" aria-pressed={selection?.kind === 'object' && selection.id === object.id} onClick={() => onNavigate({ kind: 'object', id: object.id }, preset?.id)}><span>{entityName('object', object)}</span><span className="entity-list__type">{preset?.label ?? '选择'}</span></button></li>;
            })}</ul>
          </section>)}
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

function useWorkspaceTier() {
  const computeTier = useCallback(() => {
    if (typeof window === 'undefined') return 'full';
    return resolveRenderProfile({
      width: window.innerWidth,
      coarsePointer: window.matchMedia?.('(pointer: coarse)').matches ?? false,
      deviceMemory: navigator.deviceMemory,
      hidden: document.visibilityState === 'hidden',
    }).mode;
  }, []);

  const [tier, setTier] = useState(computeTier);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const update = () => setTier(computeTier());
    update();
    const mediaQueries = [window.matchMedia?.('(pointer: coarse)')].filter(Boolean);
    for (const query of mediaQueries) {
      query.addEventListener?.('change', update);
    }
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      for (const query of mediaQueries) {
        query.removeEventListener?.('change', update);
      }
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, [computeTier]);

  return tier;
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
    <div className="lab__workspace"><section className="panel plan-panel" aria-labelledby="plan-title"><div className="panel__header panel__header--plan"><div><p className="panel__kicker">Canonical · 11,000 × 8,000 mm</p><h2 className="panel__title" id="plan-title">{workspaceMode === '3d' ? '一层数字住宅' : '一层建筑平面'}</h2></div><div className="workspace-switch" aria-label="空间显示维度"><button type="button" aria-pressed={workspaceMode === '2d'} onClick={() => setWorkspaceMode('2d')}><MapTrifold size={16} />2D</button><button type="button" aria-pressed={workspaceMode === '3d'} onClick={() => setWorkspaceMode('3d')}><Cube size={16} />3D</button></div></div>{workspaceMode === '2d' ? <ScenePlan sceneModel={scene} mode={mode} onModeChange={setMode} selection={selection} onSelect={selectEntity} /> : <Suspense fallback={<div className="scene3d-loading">正在启动内部 3D 校验器…</div>}><Scene3D key="surface-occlusion-v1" scene={scene} selection={selection} onSelect={selectEntity} onExitTo2D={() => setWorkspaceMode('2d')} activeRoomId={activeRoomId} roomLabels={roomLabels} onStats={setRenderStats} viewRequest={viewRequest} /></Suspense>}</section><Inspector sceneModel={scene} selection={selection} onNavigate={navigateEntity} mode={mode} workspaceMode={workspaceMode} renderStats={renderStats} /></div>
    <section className="evidence" aria-label="Scene validation evidence"><div className="panel evidence__summary"><p className="evidence__label">Validation evidence</p><dl className="evidence__facts"><dt>Scene</dt><dd>{scene.id}</dd><dt>Schema</dt><dd>v{scene.schemaVersion}</dd><dt>Rooms</dt><dd>{scene.rooms.length}</dd><dt>Objects / GLB</dt><dd>{scene.objects.length} / {scene.objects.length}</dd><dt>Camera presets</dt><dd>{scene.cameraPresets.length}</dd><dt>Round trip</dt><dd>{roundTripMatches ? 'byte-identical' : 'mismatch'}</dd></dl>{!validation.ok && <ul className="validation-list">{validation.errors.map((error) => <li key={`${error.code}-${error.path}`}>{error.path}: {error.message}</li>)}</ul>}</div><div className="panel evidence__json"><div className="evidence__json-header"><div><p className="evidence__label">Canonical JSON</p><span className="panel__meta">{serializedBytes.toLocaleString()} bytes · read only</span></div><button className="utility-button" type="button" onClick={copyJson}>{copyStatus}</button></div><textarea className="json" readOnly spellCheck="false" value={serialized} aria-label="Canonical scene JSON" /></div></section>
  </main>;
}

function ProjectDemoPage() {
  const [initialVersionProject] = useState(createInitialVersionProject);
  const [sceneStore, setSceneStore] = useState(initialVersionProject.store);
  const [versionHistory, setVersionHistory] = useState(initialVersionProject.history);
  const [householdConsensus, setHouseholdConsensus] = useState(() => createInitialHouseholdProject(initialVersionProject.history));
  const [designBrief, setDesignBrief] = useState(createInitialDesignBrief);
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
  const [editMode, setEditMode] = useState('move');
  const [editFeedback, setEditFeedback] = useState({ tone: 'neutral', message: '选择家具后可编辑' });
  const [pendingReview, setPendingReview] = useState(null);
  const viewerTier = useWorkspaceTier();
  const [pascalExpanded, setPascalExpanded] = useState(viewerTier === 'full');
  useEffect(() => { setPascalExpanded(viewerTier === 'full'); }, [viewerTier]);
  const [advancedEditing, setAdvancedEditing] = useState(false);
  const [handoffSync, setHandoffSync] = useState({ status: 'idle', message: '客户确认后可提交设计师复核。', reviewUrl: null, handoffUrl: null });
  const [lastRejected, setLastRejected] = useState(null);
  const [dimensionDraft, setDimensionDraft] = useState(null);
  const [versionDrawerOpen, setVersionDrawerOpen] = useState(false);
  const [compareFromVersionId, setCompareFromVersionId] = useState(initialVersionProject.history.versions[0].id);
  const [sidecarMode, setSidecarMode] = useState('agent');
  const [agentInput, setAgentInput] = useState('');
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentCapability, setAgentCapability] = useState({ aily: 'checking', base: 'checking', provider: 'local' });
  const [agentMessages, setAgentMessages] = useState([{
    id: 'agent-welcome',
    role: 'assistant',
    text: `我已读取这套住宅的 ${scene.rooms.length} 个空间和当前版本。先告诉我哪个房间最想改变；我会先给出可执行方案，再说明取舍。`,
    source: 'local',
    tools: [],
  }]);
  const [activeMemberId, setActiveMemberId] = useState(householdConsensus.members[0].id);
  const [opinionStance, setOpinionStance] = useState('support');
  const [opinionText, setOpinionText] = useState('');
  const [consensusFeedback, setConsensusFeedback] = useState('三位成员依次表达；所有意见都写入同一共享版本。');
  const agentMessageListRef = useRef(null);
  const advancedStartSceneRef = useRef(null);
  const versionDrawerRef = useRef(null);
  const versionDrawerActivatorRef = useRef(null);
  const versionDrawerWasOpenRef = useRef(false);
  const homePreset = currentScene.cameraPresets.find((preset) => preset.kind === 'whole_home');
  const selection = selectionFromId(currentScene, navigation.selectedId) ?? (navigation.roomId ? { kind: 'room', id: navigation.roomId } : null);
  const displaySelection = selectionFromId(currentScene, displaySelectedId) ?? (displayRoomId ? { kind: 'room', id: displayRoomId } : null);
  const selectedEntity = findEntity(currentScene, selection);
  const displaySelectedEntity = findEntity(currentScene, displaySelection);
  const selectedObject = selectedEntity?.kind === 'object' ? selectedEntity.entity : null;
  const selectedSurface = selectedEntity?.kind === 'surface' ? selectedEntity.entity : null;
  const activeRoomId = navigation.roomId;
  const activeRoomSurfaces = currentScene.surfaces
    .filter((surface) => surface.roomId === activeRoomId)
    .sort((left, right) => ['floor', 'ceiling', 'wall'].indexOf(left.kind) - ['floor', 'ceiling', 'wall'].indexOf(right.kind));
  const currentRoom = currentScene.rooms.find((room) => room.id === displayRoomId) ?? null;
  const currentRoomLabel = currentRoom ? (roomLabels[currentRoom.id] ?? currentRoom.name) : '整屋';
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
  const canSubmitDesignerReview = currentVersion.status === 'customer_confirmed' && !hasUnsavedChanges && !pendingReview;
  const activeMember = householdConsensus.members.find((member) => member.id === activeMemberId) ?? householdConsensus.members[0];
  const opinionTarget = selectedObject
    ? { type: 'object', id: selectedObject.id }
    : currentRoom
      ? { type: 'room', id: currentRoom.id }
      : { type: 'version', id: currentVersion.id };
  const opinionTargetLabel = opinionTarget.type === 'object'
    ? entityName('object', selectedObject)
    : opinionTarget.type === 'room'
      ? currentRoomLabel
      : currentVersion.label;
  const householdConflicts = useMemo(() => detectHouseholdConflicts(householdConsensus), [householdConsensus]);
  const activeConflict = householdConflicts.find((conflict) => conflict.versionId === currentVersion.id) ?? householdConflicts.at(-1) ?? null;
  const conflictDirections = activeConflict
    ? householdConsensus.directions.filter((direction) => direction.conflictId === activeConflict.id)
    : [];
  const conflictOpinions = activeConflict
    ? householdConsensus.opinions.filter((opinion) => opinion.versionId === activeConflict.versionId
      && opinion.target.type === activeConflict.target.type
      && opinion.target.id === activeConflict.target.id)
    : [];
  const consensusDirectionOptions = useMemo(() => {
    if (!activeConflict || activeConflict.target.type !== 'object' || householdConsensus.finalDecision) return [];
    const object = currentScene.objects.find((candidate) => candidate.id === activeConflict.target.id);
    if (!object?.capabilities?.movable) return [];
    const candidates = [
      { key: 'east', label: '向东', dx: 200, dz: 0 },
      { key: 'north', label: '向北', dx: 0, dz: -200 },
      { key: 'west', label: '向西', dx: -200, dz: 0 },
      { key: 'south', label: '向南', dx: 0, dz: 200 },
    ];
    return candidates.flatMap((candidate) => {
      const command = {
        type: 'object.setTransform',
        objectId: object.id,
        transform: { x: object.transform.x + candidate.dx, z: object.transform.z + candidate.dz },
      };
      try {
        const beforeRules = evaluateDesignRules(sceneStore.currentScene);
        const preview = dispatchSceneCommand(sceneStore, command);
        const rules = evaluateDesignRules(preview.currentScene);
        if (newReviewChecks(beforeRules, rules, [object.id]).length) return [];
        return [{
          id: `direction-${activeConflict.id}-${candidate.key}`,
          title: candidate.label,
          summary: `${entityName('object', object)}${candidate.label}轻微调整 200 mm，保留当前尺寸与材质；没有新增规则提醒。`,
          feasible: true,
          command,
        }];
      } catch {
        return [];
      }
    }).slice(0, 2).map((direction, index) => ({ ...direction, title: `位置方案 ${index ? 'B' : 'A'}` }));
  }, [activeConflict, currentScene.objects, householdConsensus.finalDecision, sceneStore]);
  const chosenDirection = householdConsensus.finalDecision
    ? householdConsensus.directions.find((direction) => direction.id === householdConsensus.finalDecision.directionId) ?? null
    : null;
  const confirmedMemberIds = new Set(householdConsensus.confirmations
    .filter((confirmation) => confirmation.versionId === householdConsensus.finalDecision?.versionId)
    .map((confirmation) => confirmation.memberId));
  const householdTargetName = (target) => {
    if (target.type === 'version') return versions.find((version) => version.id === target.id)?.label ?? target.id;
    if (target.type === 'room') {
      const room = currentScene.rooms.find((candidate) => candidate.id === target.id);
      return room ? (roomLabels[room.id] ?? room.name) : target.id;
    }
    const object = currentScene.objects.find((candidate) => candidate.id === target.id)
      ?? versions.flatMap((version) => version.scene.objects).find((candidate) => candidate.id === target.id);
    return object ? entityName('object', object) : target.id;
  };
  const visibleRuleChecks = useMemo(() => {
    const relevant = selectedObject
      ? designEvaluation.checks.filter((check) => check.objectIds.includes(selectedObject.id))
      : activeRoomId
        ? filterDesignRuleChecksForRoom(currentScene, designEvaluation.checks, activeRoomId)
        : designEvaluation.violations;
    return relevant
      .sort((a, b) => ['blocked', 'warning', 'recommendation', 'passed'].indexOf(a.status) - ['blocked', 'warning', 'recommendation', 'passed'].indexOf(b.status))
      .slice(0, 4);
  }, [activeRoomId, currentScene, designEvaluation, selectedObject]);
  const currentViewLabel = displayViewId === 'free'
    ? '自由视角'
    : currentScene.cameraPresets.find((preset) => preset.id === displayViewId)?.label ?? '整屋';
  const selectedLabel = displaySelectedEntity ? entityName(displaySelectedEntity.kind, displaySelectedEntity.entity) : '未选择对象';
  const roomBrief = activeRoomId ? roomBriefs[activeRoomId] : null;
  const agentHasConversation = agentMessages.some((message) => message.role === 'user');
  const agentQuickPrompts = selectedSurface
    ? selectedSurface.kind === 'wall'
      ? ['这面墙改成暖灰', '这面墙改成浅橡木饰面', '检查当前房间规则']
      : selectedSurface.kind === 'floor'
        ? ['这个地面改成暖灰瓷砖', '这个地面改成浅橡木地板', '对比上一版变化']
        : ['这个顶面改成暖灰', '这个顶面改成暖白', '对比上一版变化']
    : activeRoomId === 'room-primary-bedroom'
    ? selectedObject?.id === 'object-primary-bed'
      ? ['双人床向左移动10厘米', '检查双人床床侧净距', '对比上一版变化']
      : selectedObject?.id === 'object-primary-wardrobe'
        ? ['衣柜改成暖白色', '检查衣柜柜前净距', '对比上一版变化']
        : ['主卧太满但收纳别少', '把衣柜改成暖白色', '对比上一版变化']
    : activeRoomId === 'room-flex'
      ? selectedObject?.id === 'object-flex-bed'
        ? ['单人床向右移动20厘米', '检查单人床床侧净距', '对比上一版变化']
        : selectedObject?.id === 'object-flex-desk'
          ? ['书桌向左移动20厘米', '检查书桌周围规则', '对比上一版变化']
          : ['检查儿童房当前规则', '单人床向右移动20厘米', '书桌向左移动20厘米']
      : [`${selectedObject?.capabilities?.movable ? entityName('object', selectedObject) : '沙发'}向右移动20厘米`, '检查当前规则', '对比上一版变化'];
  const namedDiffs = useMemo(() => [
    ...versionDiff.objectDiffs.map((diff) => ({
      ...diff,
      entityId: diff.objectId,
      label: entityName('object', currentScene.objects.find((object) => object.id === diff.objectId) ?? compareFromVersion.scene.objects.find((object) => object.id === diff.objectId) ?? { id: diff.objectId, name: diff.objectId }),
    })),
    ...versionDiff.surfaceDiffs.map((diff) => ({
      ...diff,
      entityId: diff.surfaceId,
      label: entityName('surface', currentScene.surfaces.find((surface) => surface.id === diff.surfaceId) ?? compareFromVersion.scene.surfaces.find((surface) => surface.id === diff.surfaceId) ?? { id: diff.surfaceId, kind: 'surface' }),
    })),
  ], [compareFromVersion.scene.objects, compareFromVersion.scene.surfaces, currentScene.objects, currentScene.surfaces, versionDiff.objectDiffs, versionDiff.surfaceDiffs]);
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
    () => ({
      id: navigation.viewId,
      sequence: viewSequence,
      focusId: selectedObject?.capabilities?.movable ? selectedObject.id : null,
    }),
    [navigation.viewId, selectedObject?.capabilities?.movable, selectedObject?.id, viewSequence],
  );
  const openVersionDrawer = useCallback(() => {
    versionDrawerActivatorRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setVersionDrawerOpen(true);
  }, []);
  const closeVersionDrawer = useCallback(() => {
    setVersionDrawerOpen(false);
  }, []);

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
    setDisplayViewId(safe.viewId);
    setDisplayRoomId(safe.roomId);
    setDisplaySelectedId(safe.selectedId);
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
        text: `当前 Agent 预览已保存为 ${nextHistory.versions.at(-1).label}。下一步可邀请家庭成员针对同一版本表达意见；我会保留分歧，不会替你们投票。`,
        source: pendingReview.versionSource ?? 'agent-local',
        tools: [],
        nextAction: 'household',
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

  const enterAdvancedEditing = () => {
    advancedStartSceneRef.current = sceneStoreRef.current.currentScene;
    setAdvancedEditing(true);
    setPascalExpanded(true);
    setSidecarMode('space');
  };

  const exitAdvancedEditing = () => {
    const beforeScene = advancedStartSceneRef.current;
    const afterScene = sceneStoreRef.current.currentScene;
    setAdvancedEditing(false);
    setSidecarMode('agent');
    advancedStartSceneRef.current = null;
    if (!beforeScene) return;
    const diff = compareSceneVersions(
      { id: 'advanced-start', scene: beforeScene },
      { id: 'working-copy', scene: afterScene },
    );
    const changeCount = diff.objectDiffs.length + diff.surfaceDiffs.length;
    const warnings = evaluateDesignRules(afterScene).checks.filter((check) => check.status === 'warning').length;
    setAgentMessages((messages) => [...messages, {
      id: `advanced-summary-${Date.now()}`,
      role: 'assistant',
      text: changeCount
        ? `高级编辑已结束：检测到 ${diff.objectDiffs.length} 项家具变化和 ${diff.surfaceDiffs.length} 项饰面变化；${warnings ? `仍有 ${warnings} 条演示规则提醒` : '当前演示规则通过'}。修改仍在工作副本中，确认后再保存版本。`
        : '高级编辑已结束，本次没有改变方案。',
      source: 'local',
      tools: [],
    }]);
  };

  const runAgentPrompt = async (rawInput) => {
    const input = String(rawInput ?? '').trim();
    if (!input || agentBusy) return;
    if (pendingReview) {
      setSidecarMode('agent');
      setAgentMessages((messages) => [...messages, {
        id: `agent-review-${Date.now()}`,
        role: 'assistant',
        text: '需保留或撤销当前规范预览；未确认状态不可叠加。',
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
      let result;
      try {
        const serializedHistory = serializeVersionHistory(beforeHistory);
        const response = await fetch('/api/agent/turn', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          signal: AbortSignal.timeout(40_000),
          body: JSON.stringify({
            eventId: turnId,
            projectId: 'project-demo',
            spaceId: activeRoomId ?? 'scene-demo-whole-home',
            versionId: beforeHistory.currentVersionId,
            input,
            selectedObjectId: navigation.selectedId,
            scene: serializeScene(beforeStore.currentScene),
            designBrief,
            ...(serializedHistory.length < 60_000 ? { versionHistory: serializedHistory } : {}),
          }),
        });
        if (!response.ok) throw new Error('AGENT_BFF_UNAVAILABLE');
        const body = await response.json();
        if (!Array.isArray(body.commands) || !body.trace) throw new Error('AGENT_BFF_INVALID');
        let replayed = beforeStore;
        for (const command of body.commands) replayed = dispatchSceneCommand(replayed, command);
        result = { store: replayed, trace: body.trace };
      } catch (apiError) {
        result = await runAgentTurn({
          store: beforeStore,
          input,
          selectedObjectId: navigation.selectedId,
          versionHistory: beforeHistory,
          designBrief,
          activeRoomId,
        });
        result = { ...result, trace: { ...result.trace, fallbackReason: result.trace.fallbackReason ?? apiError?.message ?? 'AGENT_BFF_UNAVAILABLE' } };
      }
      const sceneChanged = serializeScene(result.store.currentScene) !== serializeScene(beforeStore.currentScene);
      if (result.trace.designBrief) setDesignBrief(normalizeDesignBrief(result.trace.designBrief));
      const successfulWrites = result.trace.steps.filter((step) => step.ok && agentWriteTools.has(step.tool));
      let needsReview = false;

      if (sceneChanged) {
        const beforeEvaluation = evaluateDesignRules(beforeStore.currentScene);
        const afterEvaluation = evaluateDesignRules(result.store.currentScene);
        const affectedObjectIds = result.trace.toolCalls.map((call) => call.args?.objectId).filter(Boolean);
        const reviewChecks = newReviewChecks(beforeEvaluation, afterEvaluation, affectedObjectIds);
        sceneStoreRef.current = result.store;
        setSceneStore(result.store);
        setLastRejected(null);

        needsReview = true;
        setPendingReview({
          checks: reviewChecks.slice(0, 3),
          saveOnKeep: true,
          startCursor: beforeStore.cursor,
          status: reviewChecks.length ? topRuleStatus(reviewChecks) : 'passed',
          versionSource: result.trace.source === 'provider' ? 'aily' : 'agent-local',
        });
        setEditFeedback({ tone: reviewChecks.length ? 'warning' : 'success', message: 'Agent 已生成可撤销预览；由你保留后才写入版本链。' });

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
        text: agentReplyFromTrace(result.trace, { pending: needsReview }),
        source: result.trace.source,
        fallbackReason: result.trace.fallbackReason,
        tools: result.trace.toolCalls.map((call) => call.tool),
        confirmationRequested: result.trace.steps.some((step) => step.ok && step.tool === 'request_confirmation'),
      }]);
    } catch {
      setAgentMessages((messages) => [...messages, {
        id: `${turnId}-assistant`,
        role: 'assistant',
        text: '本轮未完成，当前场景保持不变。请重试或缩小到一个房间与一个目标。',
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
    const nextHistory = saveSceneVersion(versionHistory, sceneStoreRef.current, { source: `manual:${activeMember.id}` });
    if (nextHistory === versionHistory) {
      setEditFeedback({ tone: 'neutral', message: `${currentVersion.label} 已包含当前场景，无需重复保存。` });
      return;
    }
    setCompareFromVersionId(currentVersion.id);
    setVersionHistory(nextHistory);
    const saved = nextHistory.versions.at(-1);
    setEditFeedback({ tone: 'success', message: `${saved.label} 已保存；可与 ${currentVersion.label} 对比或回退。` });
    setAgentMessages((messages) => [...messages, {
      id: `manual-saved-${saved.id}`,
      role: 'assistant',
      text: `${saved.label} 已进入版本链。需要家庭共识时，请让每位成员针对这个版本表达真实理由。`,
      source: 'local',
      tools: [],
      nextAction: 'household',
    }]);
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
    setHandoffSync({ status: 'idle', message: '已客户确认，可以提交设计师复核。', reviewUrl: null, handoffUrl: null });
  };

  const submitDesignerReview = async () => {
    if (!canSubmitDesignerReview) {
      setHandoffSync({ status: 'failed', message: hasUnsavedChanges || pendingReview ? '请先保存修改并处理规则预览。' : '需要先完成客户确认。', reviewUrl: null, handoffUrl: null });
      return;
    }
    const id = eventId('evt-handoff');
    setHandoffSync({ status: 'pending', message: '正在提交复核快照…', reviewUrl: null, handoffUrl: null });
    try {
      await fetchJson(`/api/projects/${PROJECT_ID}/snapshot`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          eventId: id,
          versionHistory: serializeVersionHistory(versionHistoryRef.current),
          householdConsensus: serializeHouseholdConsensus(householdConsensus),
        }),
      });
      await fetchJson(`/api/versions/${currentVersion.id}/confirm`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ eventId: `${id}-confirm` }),
      });
      setHandoffSync({
        status: 'synced',
        message: '已提交设计师复核；真实欧派数据仍以 pending 字段保留。',
        reviewUrl: `/${'review'}/${PROJECT_ID}?versionId=${encodeURIComponent(currentVersion.id)}`,
        handoffUrl: `/handoff/${encodeURIComponent(currentVersion.id)}`,
      });
    } catch (error) {
      setHandoffSync({ status: 'failed', message: `提交失败：${error.message}`, reviewUrl: null, handoffUrl: null });
    }
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

  const submitHouseholdOpinion = (event) => {
    event.preventDefault();
    const note = opinionText.trim();
    if (!note) {
      setConsensusFeedback('先写下这一位成员的真实理由。');
      return;
    }
    if (hasUnsavedChanges || pendingReview) {
      setConsensusFeedback(hasUnsavedChanges ? '先把当前修改保存为版本，再让意见绑定到它。' : '先处理当前规则预览。');
      return;
    }
    try {
      const next = addHouseholdOpinion(householdConsensus, {
        memberId: activeMember.id,
        stance: opinionStance,
        target: opinionTarget,
        versionId: currentVersion.id,
        note,
      });
      const conflictCount = detectHouseholdConflicts(next).length;
      setHouseholdConsensus(next);
      setOpinionText('');
      setConsensusFeedback(conflictCount > householdConflicts.length
        ? '共识助手识别到同一对象上的相反立场，可以生成两套真实可行方向。'
        : `${activeMember.name}的意见已绑定到 ${currentVersion.label} · ${opinionTargetLabel}。`);
      if (conflictCount > householdConflicts.length) {
        setAgentMessages((messages) => [...messages, {
          id: `agent-conflict-${next.opinions.at(-1).id}`,
          role: 'assistant',
          text: `我识别到家庭成员对${opinionTargetLabel}存在相反立场。原始意见会保留；我只生成经过同一 scene 规则校验的少数方向，由家庭决定。`,
          source: 'local',
          tools: [],
          nextAction: 'household',
        }]);
      }
    } catch {
      setConsensusFeedback('这条意见没有保存，请检查成员、对象和版本是否仍有效。');
    }
  };

  const generateConsensusDirections = () => {
    if (!activeConflict || consensusDirectionOptions.length < 2) {
      setConsensusFeedback('当前目标无法生成两套无新增规则提醒的位移方向，请先选择可移动家具。');
      return;
    }
    const next = setConflictDirections(householdConsensus, {
      conflictId: activeConflict.id,
      versionId: activeConflict.versionId,
      directions: consensusDirectionOptions.map(({ command: _command, ...direction }) => direction),
    });
    setHouseholdConsensus(next);
    setConsensusFeedback('已用同一 scene 校验两套方向；二者都没有新增规则提醒。');
  };

  const applyConsensusDirection = (direction) => {
    if (hasUnsavedChanges || pendingReview || direction.versionId !== currentVersion.id) {
      setConsensusFeedback('方案基准已经变化，请先保存或回到它对应的版本。');
      return;
    }
    const option = consensusDirectionOptions.find((candidate) => candidate.id === direction.id);
    if (!option) {
      setConsensusFeedback('当前 scene 已变化，需要重新生成方向。');
      return;
    }
    try {
      const beforeHistory = versionHistoryRef.current;
      const nextStore = dispatchSceneCommand(sceneStoreRef.current, option.command);
      const nextHistory = saveSceneVersion(beforeHistory, nextStore, { source: `household:${activeMember.id}` });
      if (nextHistory === beforeHistory) throw new Error('CONSENSUS_DIRECTION_NO_CHANGE');
      const outcomeVersion = nextHistory.versions.at(-1);
      const nextConsensus = chooseConsensusDirection(householdConsensus, {
        directionId: direction.id,
        versionId: outcomeVersion.id,
        memberId: activeMember.id,
      });
      sceneStoreRef.current = nextStore;
      versionHistoryRef.current = nextHistory;
      setSceneStore(nextStore);
      setVersionHistory(nextHistory);
      setCompareFromVersionId(beforeHistory.currentVersionId);
      setHouseholdConsensus(nextConsensus);
      setConsensusFeedback(`${activeMember.name}选择了“${direction.title}”，已形成 ${outcomeVersion.label}；现在请三位成员分别确认。`);
      setAgentMessages((messages) => [...messages, {
        id: `agent-direction-${outcomeVersion.id}`,
        role: 'assistant',
        text: `“${direction.title}”已形成 ${outcomeVersion.label}。原分歧仍可追溯；现在需要三位成员分别确认，我不会代替任何人确认。`,
        source: 'local',
        tools: [],
        nextAction: 'household',
      }]);
    } catch (error) {
      setConsensusFeedback(`没有应用：${normalizeEditError(error)}`);
    }
  };

  const confirmHouseholdDecision = () => {
    const decision = householdConsensus.finalDecision;
    if (!decision || decision.versionId !== currentVersion.id || hasUnsavedChanges || pendingReview) {
      setConsensusFeedback('只能确认当前已保存、没有待处理预览的共同方向。');
      return;
    }
    const nextConsensus = confirmConsensusVersion(householdConsensus, { memberId: activeMember.id, versionId: decision.versionId });
    setHouseholdConsensus(nextConsensus);
    if (nextConsensus.confirmations.length === nextConsensus.members.length) {
      const nextHistory = confirmSceneVersion(versionHistoryRef.current, decision.versionId, { actor: 'household' });
      versionHistoryRef.current = nextHistory;
      setVersionHistory(nextHistory);
      setConsensusFeedback(`${currentVersion.label} 已得到三位成员共同确认；每次确认都可追溯到成员和版本。`);
      setAgentMessages((messages) => [...messages, {
        id: `agent-household-confirmed-${decision.versionId}`,
        role: 'assistant',
        text: `${currentVersion.label} 已得到三位成员共同确认。下一步可查看版本影响并提交设计师复核；企业报价、BOM 与施工数据仍标记为 pending。`,
        source: 'local',
        tools: [],
        nextAction: 'version',
      }]);
    } else {
      setConsensusFeedback(`${activeMember.name}已确认；还差 ${nextConsensus.members.length - nextConsensus.confirmations.length} 位。`);
    }
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
    try { window.localStorage.setItem(CONSENSUS_STORAGE_KEY, serializeHouseholdConsensus(householdConsensus)); }
    catch { /* Offline cache failure must not block the shared demo session. */ }
  }, [householdConsensus]);

  useEffect(() => {
    try { window.localStorage.setItem(DESIGN_BRIEF_STORAGE_KEY, serializeDesignBrief(designBrief)); }
    catch { /* Offline cache failure must not block the live design session. */ }
  }, [designBrief]);

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
    if (versionDrawerOpen) {
      const drawer = versionDrawerRef.current;
      const firstFocusable = drawer?.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      (firstFocusable ?? drawer)?.focus?.();
    } else if (versionDrawerWasOpenRef.current) {
      versionDrawerActivatorRef.current?.focus?.();
      versionDrawerActivatorRef.current = null;
    }
    versionDrawerWasOpenRef.current = versionDrawerOpen;
  }, [versionDrawerOpen]);

  useEffect(() => {
    if (!versionDrawerOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeVersionDrawer();
        return;
      }
      if (event.key !== 'Tab') return;
      const drawer = versionDrawerRef.current;
      if (!drawer) return;
      const focusables = [...drawer.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
        .filter((element) => !element.hasAttribute('disabled'));
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeVersionDrawer, versionDrawerOpen]);

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
        {handoffSync.reviewUrl
          ? <a className="utility-button" href={handoffSync.reviewUrl}>设计师复核</a>
          : <button className="utility-button" type="button" onClick={openVersionDrawer}>设计师复核</button>}
        {handoffSync.handoffUrl
          ? <a className="utility-button" href={handoffSync.handoffUrl}>交接 JSON</a>
          : <button className="utility-button" type="button" onClick={openVersionDrawer}>交接 JSON</button>}
        <button className="utility-button" data-testid="open-version-drawer" type="button" onClick={openVersionDrawer}><ClockCounterClockwise size={15} aria-hidden="true" />{currentVersion.label}{hasUnsavedChanges ? ' · 未保存' : ''}</button>
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
          <div className="project-stage__tier" data-tier={viewerTier} data-advanced={advancedEditing}>
            <span>{advancedEditing ? '高级编辑已打开' : (viewerTier === 'full' ? 'AI 设计视图' : '轻量浏览 · 先省资源')}</span>
            {viewerTier !== 'full' && !pascalExpanded && <button type="button" onClick={() => setPascalExpanded(true)}>进入完整 3D</button>}
            {advancedEditing && <button type="button" onClick={exitAdvancedEditing}>退出高级编辑</button>}
          </div>
        </div>
        {viewerTier !== 'full' && !pascalExpanded
          ? <div className="pascal-stage-light">
            <p className="pascal-stage-light__kicker">轻量浏览模式</p>
            <strong>{currentRoomLabel}</strong>
            <span>当前设备先保留 2D 总览与右侧上下文，完整 Pascal 3D 只在需要时加载。</span>
            <div className="pascal-stage-light__actions">
              <button type="button" className="utility-button utility-button--strong" onClick={() => setPascalExpanded(true)}>进入完整 3D</button>
            </div>
          </div>
          : <Suspense fallback={<div className="pascal-stage-loading">正在启动装修编辑器…</div>}>
            <PascalStage
              scene={currentScene}
              selection={selection}
              onSelect={selectEntity}
              onEditCommand={(command) => Boolean(executeCommand(command))}
              activeRoomId={displayRoomId}
              roomLabels={roomLabels}
              advancedMode={advancedEditing}
              loadingFallback={<>
                <div><strong>实时 3D 正在载入</strong><span>先用同源 2D 核对房间、家具和当前选择；载入完成后会原位切换。</span></div>
                <ScenePlan sceneModel={currentScene} mode="overlay" selection={selection} onSelect={navigateFromPlan} showModeRail={false} compact />
              </>}
            />
          </Suspense>}
      </section>

      <aside className="project-sidebar" data-mode={sidecarMode}>
        <nav className="project-sidebar__switch" aria-label="右侧工作区">
          <button type="button" aria-pressed={sidecarMode === 'agent'} onClick={() => setSidecarMode('agent')}><ChatCircleDots size={15} />Agent</button>
          <button type="button" aria-pressed={sidecarMode === 'space'} onClick={() => setSidecarMode('space')}><Cube size={15} />微调</button>
          <button type="button" aria-pressed={sidecarMode === 'household'} onClick={() => setSidecarMode('household')}><UsersThree size={15} />家庭</button>
        </nav>
        {sidecarMode === 'space' ? <>
        <article className="panel project-panel project-panel--overview">
          <div className="panel__header">
            <div>
              <p className="panel__kicker">2D 同步总览</p>
              <h2 className="panel__title">当前户型与布置</h2>
            </div>
            <span className="panel__meta">点房间进入 · 点家具选择</span>
          </div>
          <div className="project-overview" data-testid="overview-2d">
            <ScenePlan sceneModel={currentScene} mode="overlay" selection={selection} onSelect={navigateFromPlan} showModeRail={false} compact />
          </div>
        </article>

        <article className="panel project-panel project-context" aria-label="当前位置摘要">
          {roomBrief && <section className="project-room-brief" aria-label={roomBrief.kicker}>
            <span>{roomBrief.kicker}</span><strong>{roomBrief.title}</strong><p>{roomBrief.summary}</p>
            <div>{roomBrief.checks.map((check) => <small key={check}>{check}</small>)}</div>
            {roomBrief.shortcuts && <div className="project-room-brief__shortcuts" aria-label="房间内快捷对象">
              {roomBrief.shortcuts.map((shortcut) => {
                const object = currentScene.objects.find((candidate) => candidate.id === shortcut.objectId);
                return object ? <button key={shortcut.objectId} type="button" onClick={() => jumpToObject(object)}>{shortcut.label}</button> : null;
              })}
            </div>}
          </section>}
          <div className="project-context__lead"><span className="live-dot" /><div><span>当前位置</span><strong>{currentRoomLabel}</strong></div></div>
          <dl className="project-context__facts"><div><dt>视角</dt><dd>{currentViewLabel}</dd></div><div><dt>选择</dt><dd>{selectedLabel}</dd></div></dl>
          {activeRoomSurfaces.length > 0 && <section className="project-surfaces" aria-label="当前房间装修表面">
            <div><span>装修表面</span><small>墙 · 地 · 顶同一 scene</small></div>
            <div>{activeRoomSurfaces.map((surface) => <button key={surface.id} type="button" aria-pressed={selectedSurface?.id === surface.id} onClick={() => selectEntity({ kind: 'surface', id: surface.id })}>
              <span>{entityName('surface', surface)}</span><small>{materialLabels[surface.materialId] ?? surface.materialId}</small>
            </button>)}</div>
          </section>}
          <div className="project-edit__history" aria-label="编辑历史">
            <button type="button" onClick={undo} disabled={sceneStore.cursor === 0} title="撤销 (Cmd/Ctrl+Z)">撤销</button>
            <button type="button" onClick={redo} disabled={sceneStore.cursor === sceneStore.commands.length} title="重做 (Shift+Cmd/Ctrl+Z)">重做</button>
            <span className="project-edit__feedback" data-tone={editFeedback.tone} aria-live="polite">{editFeedback.message}</span>
          </div>
          {pendingReview && <div className="project-review" data-status={pendingReview.status} data-testid="pending-rule-review">
            <div>
              <strong>{reviewTitle(pendingReview.status)}</strong>
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
          {selectedObject && <div className="project-object" data-testid="selected-object-details" data-layer={advancedEditing ? 'advanced' : 'quick'}>
            <div><span>{advancedEditing ? selectedObject.externalId : entityName('object', selectedObject)}</span><strong>{advancedEditing ? (selectedObject.source === 'demo' ? '演示对象' : '企业对象') : '当前家具'}</strong></div>
            {advancedEditing && <dl>
              <div><dt>尺寸</dt><dd>{selectedObject.dimensions.width} × {selectedObject.dimensions.depth} × {selectedObject.dimensions.height} mm</dd></div>
              <div><dt>能力</dt><dd>{selectedObject.capabilities.movable ? '可移动 / 可旋转' : '固定构件'}</dd></div>
              <div><dt>层级</dt><dd>{roomLabels[selectedObject.roomId] ?? selectedObject.roomId} / {objectLayerLabels[selectedObject.hierarchy.layer]}</dd></div>
              <div><dt>宿主</dt><dd>{selectedObject.placement.hostSurfaceId}</dd></div>
              {selectedObject.installation && <div><dt>安装</dt><dd>{selectedObject.installation.kind} · {selectedObject.installation.mount === 'wall' ? '墙装' : '落地'}</dd></div>}
              <div><dt>碰撞</dt><dd>{selectedObject.collision.kind} · {selectedObject.collision.dimensions.width} × {selectedObject.collision.dimensions.depth} mm</dd></div>
              <div><dt>模型槽</dt><dd>{selectedObject.model3D.slotId} · r{selectedObject.model3D.revision}</dd></div>
              <div><dt>复核</dt><dd>{selectedObject.review.requiresProfessionalReview ? '需专业复核' : '无需额外复核'}</dd></div>
            </dl>}
            {!advancedEditing && <p className="project-object__quick-note">快速微调只显示该对象允许的低风险操作；完整尺寸、复制与删除在高级编辑中提供。</p>}
            <div className="project-edit" aria-label={`${entityName('object', selectedObject)}编辑工具`}>
              {advancedEditing && (selectedObject.capabilities.movable || selectedObject.capabilities.rotatable) && <div className="project-edit__modes" aria-label="编辑模式">
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
                {currentScene.materials.filter((material) => material.appliesTo.includes('object')).map((material) => <button key={material.id} type="button" aria-label={`切换为${material.name}`} aria-pressed={selectedObject.materialId === material.id} onClick={() => executeCommand({ type: 'object.setMaterial', objectId: selectedObject.id, materialId: material.id }, `已切换为${material.name}`)}><i style={{ background: material.color }} />{material.name}</button>)}
              </div>}
              {advancedEditing && selectedObject.capabilities.parameterEditable && dimensionDraft && <form className="project-edit__dimensions" onSubmit={(event) => { event.preventDefault(); resizeSelected(); }}>
                {Object.entries({ width: '宽', depth: '深', height: '高' }).map(([key, label]) => <label key={key}><span>{label}</span><input aria-label={`${label}度，毫米`} type="number" min="1" step="10" value={dimensionDraft[key]} onInput={(event) => updateDimensionDraft(key, event.currentTarget.value)} onChange={(event) => updateDimensionDraft(key, event.currentTarget.value)} /></label>)}
                <button type="button" onClick={resizeSelected}>应用尺寸</button>
              </form>}
              {advancedEditing && (selectedObject.capabilities.deletable || selectedObject.capabilities.duplicable) && <div className="project-edit__object-actions">
                {selectedObject.capabilities.duplicable && <button type="button" onClick={duplicateSelected}>复制</button>}
                {selectedObject.capabilities.deletable && <button type="button" onClick={deleteSelected}>删除</button>}
              </div>}
              {!advancedEditing && !selectedObject.capabilities.movable && !selectedObject.capabilities.rotatable && !selectedObject.capabilities.materialEditable && <p className="project-edit__locked">这是固定构件，没有可用的住户微调操作。</p>}
            </div>
            {!advancedEditing && <button className="project-object__advanced" type="button" onClick={enterAdvancedEditing}>进入高级编辑</button>}
          </div>}
          {selectedSurface && <div className="project-object project-surface" data-testid="selected-surface-details">
            <div><span>{selectedSurface.id}</span><strong>演示饰面</strong></div>
            <dl>
              <div><dt>类型</dt><dd>{surfaceKindLabels[selectedSurface.kind]}</dd></div>
              <div><dt>房间</dt><dd>{roomLabels[selectedSurface.roomId] ?? selectedSurface.roomId}</dd></div>
              <div><dt>当前饰面</dt><dd>{materialLabels[selectedSurface.materialId] ?? selectedSurface.materialId}</dd></div>
              <div><dt>来源</dt><dd>source: {selectedSurface.source}</dd></div>
            </dl>
            <div className="project-edit" aria-label={`${entityName('surface', selectedSurface)}饰面工具`}>
              <div className="project-edit__materials" aria-label="兼容饰面">
                <span>可用饰面</span>
                {currentScene.materials.filter((material) => material.appliesTo.includes(selectedSurface.kind)).map((material) => <button key={material.id} type="button" aria-label={`切换为${material.name}`} aria-pressed={selectedSurface.materialId === material.id} onClick={() => executeCommand({ type: 'surface.setMaterial', surfaceId: selectedSurface.id, materialId: material.id }, `${entityName('surface', selectedSurface)}已切换为${material.name}`)}><i style={{ background: material.color }} />{material.name}</button>)}
              </div>
            </div>
          </div>}
          <div className="project-rules" aria-label="设计规则检查" data-layer={advancedEditing ? 'advanced' : 'summary'}>
            <div className="project-rules__header"><span>规则检查</span><strong data-status={lastRejected ? 'blocked' : designEvaluation.status}>{lastRejected ? '刚才已阻止' : (ruleStatusLabels[designEvaluation.status] ?? designEvaluation.status)}</strong></div>
            <p className="project-rules__scope">适用边界：当前合成演示户型 · source: demo；真实欧派 / 施工规范待企业 API 复核。</p>
            {advancedEditing && <ul>
              {lastRejected && <li data-status="blocked"><span>未写入</span><p>{lastRejected.message}</p><small>刚才尝试没有改变 2D / 3D 场景 · source: {lastRejected.source}</small></li>}
              {visibleRuleChecks.map((check) => <li key={`${check.code}-${check.ruleId}-${check.objectIds.join('-')}`} data-status={check.status}>
                <span>{ruleStatusLabels[check.status] ?? check.status}</span>
                <p>{check.message}</p>
                {check.suggestion && <small>可这样调整：{check.suggestion}</small>}
                {check.applicability && <small>适用边界：{check.applicability} · source: {check.source}</small>}
              </li>)}
            </ul>}
          </div>
          <p>{displaySelectedEntity?.kind === 'object'
            ? '已定位到所选家具；可在三维画布或右侧工具中编辑，规则不通过时不会写入 scene。'
            : displaySelectedEntity?.kind === 'surface'
              ? '已选择真实装修表面；饰面修改会同步进入 2D、3D、版本与交接。'
            : (displayRoomId ? '使用画布底部的视角胶囊切换俯视、入口与主功能面；选择对象不会因切换镜头而丢失。' : '从 3D 房间地面或右侧 2D 户型选择空间，镜头会先进入三维俯视。')}</p>
        </article>
        </> : sidecarMode === 'agent' ? <article className="panel agent-sidecar" data-testid="agent-sidecar">
          <header className="agent-sidecar__header">
            <div className="agent-sidecar__identity"><span><Sparkle size={16} aria-hidden="true" /></span><div><strong>AI 设计协同</strong><small>{agentCapability.provider === 'local' ? '本地规划器' : agentCapability.provider}</small></div></div>
            <div className="agent-sidecar__capability" data-status={agentCapability.aily === 'ready' ? 'ready' : 'fallback'}><i />{agentCapability.aily === 'ready' ? 'Aily 可用' : '本地降级'}</div>
          </header>

          <div className="agent-sidecar__scope">
            <span>当前上下文</span><strong>{currentRoomLabel} · {selectedLabel}</strong>
            <small>{capabilityLabel(agentCapability.aily, 'Aily')} · {capabilityLabel(agentCapability.base, '飞书留痕')}</small>
            <small>已识别 {designBrief.goals.length} 个目标 · {designBrief.hardConstraints.length} 条硬约束 · {designBrief.softPreferences.length} 个偏好 · {designBrief.unresolvedIssues.length} 个未决项</small>
          </div>

          <div className="agent-task-actions" aria-label="当前设计动作">
            <button type="button" onClick={() => setAgentInput(`请先看看${selectedLabel}，给出一个改进方向，不要直接修改。`)}>让 Agent 调整</button>
            <button type="button" onClick={() => setSidecarMode('space')}>快速微调</button>
            <button type="button" onClick={enterAdvancedEditing}>高级编辑</button>
          </div>

          <div className="agent-quick" aria-label="快速真实任务">
            {agentQuickPrompts.map((prompt) => <button key={prompt} type="button" onClick={() => runAgentPrompt(prompt)} disabled={agentBusy || Boolean(pendingReview)}>{prompt}</button>)}
          </div>

          <div className="agent-messages" ref={agentMessageListRef} aria-live="polite" aria-label="Agent 对话">
            {agentMessages.map((message) => <article key={message.id} className="agent-message" data-role={message.role}>
              <div className="agent-message__meta"><span>{message.role === 'user' ? '你' : 'Agent'}</span>{message.role === 'assistant' && <small>{message.source === 'provider' ? 'AILY' : 'LOCAL'}{message.fallbackReason ? ' · 已自动降级' : ''}</small>}</div>
              <p>{message.text}</p>
              {message.tools?.length > 0 && <div className="agent-message__tools">{message.tools.map((tool) => <span key={tool}>{agentToolLabels[tool] ?? tool}</span>)}</div>}
              {message.confirmationRequested && <button className="agent-message__action" type="button" onClick={openVersionDrawer}>查看版本并由我确认</button>}
              {message.nextAction === 'household' && <button className="agent-message__action" type="button" onClick={() => setSidecarMode('household')}>进入家庭共识</button>}
              {message.nextAction === 'version' && <button className="agent-message__action" type="button" onClick={openVersionDrawer}>查看版本与交接</button>}
            </article>)}
            {agentBusy && <article className="agent-message" data-role="assistant" data-busy="true"><div className="agent-message__meta"><span>Agent</span><small>AILY → LOCAL</small></div><p>Aily 正在分析当前 scene、版本和规则；超时后自动切换本地规划器。</p></article>}
            {!agentBusy && !agentHasConversation && <section className="agent-empty" aria-label="Agent 初始提示">
              <strong>选择房间或家具后开始</strong>
              <p>基于当前选择、版本和规则生成可验证变更，并保留未决项。</p>
              <div>
                <button type="button" onClick={() => runAgentPrompt(agentQuickPrompts[0])}>{agentQuickPrompts[0]}</button>
                <button type="button" onClick={openVersionDrawer}>查看当前版本</button>
              </div>
            </section>}
          </div>

          {pendingReview && <div className="agent-review" data-status={pendingReview.status}>
            <strong>{reviewTitle(pendingReview.status)}</strong>
            <p>{pendingReview.checks[0]?.message ?? '场景已按当前目标生成预览，尚未保存为新版本。'}</p>
            {designBrief.softPreferences.includes('控制预算') && <small>预算已记录为偏好；当前只能验证设计变化，真实成本是否下降需等待欧派报价 API。</small>}
            <div><button type="button" onClick={keepPendingReview}>保留并保存</button><button type="button" onClick={discardPendingReview}>撤销预览</button></div>
          </div>}

          <form className="agent-composer" onSubmit={submitAgentPrompt}>
            <textarea rows="3" maxLength="4000" aria-label="告诉 Agent 你的设计需求" placeholder={`试试：${agentQuickPrompts[0]}`} value={agentInput} onChange={(event) => setAgentInput(event.currentTarget.value)} disabled={agentBusy} />
            <button type="submit" aria-label="发送给 Agent" disabled={agentBusy || !agentInput.trim() || Boolean(pendingReview)}><PaperPlaneTilt size={17} aria-hidden="true" /></button>
          </form>
          <footer className="agent-sidecar__footer">每次修改都会先检查空间规则并生成预览；未经你确认，不会保存为新版本。</footer>
        </article> : <article className="panel household-sidecar" data-testid="household-sidecar">
          <header className="household-sidecar__header">
            <div><span><UsersThree size={17} aria-hidden="true" /></span><div><strong>家庭共识</strong><small>当前为 Demo 顺序切换，不是实时多人同步</small></div></div>
            <em>同一版本</em>
          </header>

          <div className="household-members" role="tablist" aria-label="当前表达成员">
            {householdConsensus.members.map((member) => <button key={member.id} type="button" role="tab" aria-selected={activeMember.id === member.id} onClick={() => setActiveMemberId(member.id)}>
              <span>{member.name.slice(0, 1)}</span><strong>{member.name}</strong>
            </button>)}
          </div>

          <section className="household-member-card" aria-label="当前成员偏好">
            <div><span>当前身份</span><strong>{activeMember.name} · {memberRoleLabels[activeMember.role] ?? activeMember.role}</strong></div>
            <p>{activeMember.preferences.map((preference) => `#${preference}`).join('  ')}</p>
          </section>

          <form className="household-opinion" onSubmit={submitHouseholdOpinion}>
            <div className="household-opinion__target"><span>意见对象</span><strong>{opinionTargetLabel}</strong><small>{currentVersion.label}</small></div>
            <div className="household-stances" aria-label="意见立场">
              {Object.entries(opinionStanceLabels).map(([stance, label]) => <button key={stance} type="button" aria-pressed={opinionStance === stance} onClick={() => setOpinionStance(stance)}>{label}</button>)}
            </div>
            <textarea rows="3" maxLength="500" aria-label={`${activeMember.name}的意见`} placeholder="写清楚想要什么，以及为什么…" value={opinionText} onChange={(event) => setOpinionText(event.currentTarget.value)} />
            <button type="submit" disabled={hasUnsavedChanges || Boolean(pendingReview) || !opinionText.trim()}>记录到共享版本</button>
            <p aria-live="polite">{consensusFeedback}</p>
          </form>

          <section className="household-conflict" data-status={activeConflict ? 'conflict' : 'clear'}>
            <div className="household-section-title"><span>共识助手</span><strong>{activeConflict ? '发现意见冲突' : '等待完整意见'}</strong></div>
            {activeConflict ? <>
              <p>{activeConflict.memberIds.length} 位成员对 {householdTargetName(activeConflict.target)} 存在支持与{activeConflict.severity === 'non_negotiable' ? '不可妥协' : '反对'}立场，基准为 {versions.find((version) => version.id === activeConflict.versionId)?.label ?? activeConflict.versionId}。</p>
              <div className="household-conflict__voices">{conflictOpinions.map((opinion) => {
                const member = householdConsensus.members.find((candidate) => candidate.id === opinion.memberId);
                return <blockquote key={opinion.id}><strong>{member?.name ?? opinion.memberId} · {opinionStanceLabels[opinion.stance]}</strong><span>{opinion.note}</span></blockquote>;
              })}</div>
              {!householdConsensus.finalDecision && conflictDirections.length === 0 && <button className="household-primary" type="button" onClick={generateConsensusDirections}>生成两套可行方向</button>}
              {!householdConsensus.finalDecision && conflictDirections.length > 0 && <div className="household-directions">
                {conflictDirections.map((direction) => <article key={direction.id}><div><strong>{direction.title}</strong><span>已校验</span></div><p>{direction.summary}</p><button type="button" onClick={() => applyConsensusDirection(direction)}>应用并创建新版本</button></article>)}
              </div>}
              {householdConsensus.finalDecision && chosenDirection && <div className="household-decision">
                <span>共同方向</span><strong>{chosenDirection.title}</strong><p>{chosenDirection.summary}</p>
                <button type="button" onClick={openVersionDrawer}>查看真实差异与影响</button>
              </div>}
            </> : <p>{householdConsensus.opinions.length < 2 ? '请至少让两位成员针对同一对象表达立场。' : '已记录的意见没有形成同一对象上的相反立场。'}</p>}
          </section>

          {householdConsensus.finalDecision && <section className="household-confirmations" data-testid="household-confirmations">
            <div className="household-section-title"><span>共同确认</span><strong>{confirmedMemberIds.size} / {householdConsensus.members.length}</strong></div>
            <div>{householdConsensus.members.map((member) => <span key={member.id} data-confirmed={confirmedMemberIds.has(member.id)}>{confirmedMemberIds.has(member.id) ? <Check size={11} /> : null}{member.name}</span>)}</div>
            <button className="household-primary" type="button" onClick={confirmHouseholdDecision} disabled={confirmedMemberIds.has(activeMember.id) || householdConsensus.finalDecision.versionId !== currentVersion.id}>{confirmedMemberIds.has(activeMember.id) ? `${activeMember.name}已确认` : `由${activeMember.name}确认当前方向`}</button>
          </section>}

          <section className="household-activity" aria-label="家庭活动记录">
            <div className="household-section-title"><span>共享活动</span><strong>{householdConsensus.opinions.length} 条意见</strong></div>
            <ol>{[...householdConsensus.opinions].reverse().slice(0, 6).map((opinion) => {
              const member = householdConsensus.members.find((candidate) => candidate.id === opinion.memberId);
              const version = versions.find((candidate) => candidate.id === opinion.versionId);
              return <li key={opinion.id}><span>{member?.name ?? opinion.memberId} · {opinionStanceLabels[opinion.stance]}</span><p>{opinion.note}</p><small>{householdTargetName(opinion.target)} · {version?.label ?? opinion.versionId}</small></li>;
            })}</ol>
          </section>
          <footer>所有意见都绑定当前版本；真实账号、通知与同时在线协作尚未接入。</footer>
        </article>}
      </aside>
    </section>
    {versionDrawerOpen && <div className="version-layer">
      <button className="version-layer__scrim" type="button" aria-label="关闭版本与影响" onClick={closeVersionDrawer} />
      <aside className="version-drawer" role="dialog" aria-modal="true" aria-labelledby="version-drawer-title" data-testid="version-impact-drawer" ref={versionDrawerRef} tabIndex={-1}>
        <header className="version-drawer__header">
          <div><p className="panel__kicker">同一 scene · 可回放</p><h2 id="version-drawer-title">版本与影响</h2></div>
          <button type="button" aria-label="关闭版本与影响" onClick={closeVersionDrawer}><X size={18} /></button>
        </header>

        <section className="version-current" data-status={currentVersionStatus}>
          <div><span>当前工作状态</span><strong>{currentVersion.label} · {versionStatusLabels[currentVersionStatus]}</strong></div>
          <p>{hasUnsavedChanges ? '当前 2D / 3D 有尚未进入版本链的真实修改。' : `已保存 ${currentVersion.summary.commandCount} 条命令，快照可由 SceneCommand 完整重建。`}</p>
          <div className="version-current__actions">
            <button type="button" onClick={saveCurrentVersion} disabled={!hasUnsavedChanges || Boolean(pendingReview)}><FloppyDisk size={15} />保存为 V{versions.length + 1}</button>
            <button type="button" onClick={confirmCurrentVersion} disabled={hasUnsavedChanges || Boolean(pendingReview) || currentVersion.status === 'customer_confirmed'}><Check size={15} />客户确认</button>
            <button type="button" onClick={submitDesignerReview} disabled={!canSubmitDesignerReview || handoffSync.status === 'pending'}><Check size={15} />提交设计师复核</button>
          </div>
          <div className="handoff-submit" data-status={handoffSync.status} role="status">
            <span>{handoffSync.message}</span>
            {handoffSync.reviewUrl && <a href={handoffSync.reviewUrl}>打开复核页</a>}
            {handoffSync.handoffUrl && <a href={handoffSync.handoffUrl}>打开交接单</a>}
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
              ? namedDiffs.map((diff, index) => <li key={`${diff.kind}-${diff.entityId}-${index}`}><span>{diffKindLabels[diff.kind]}</span><p>{diff.label}</p></li>)
              : <li><span>无变化</span><p>基准版与当前场景完全一致</p></li>}
          </ul>
          <dl className="version-impact" aria-label="影响摘要">
            <div><dt>规则状态</dt><dd>{ruleStatusLabels[versionDiff.impact.status] ?? versionDiff.impact.status}</dd></div>
            <div><dt>对象差异</dt><dd>{versionDiff.objectDiffs.length}</dd></div>
            <div><dt>表面差异</dt><dd>{versionDiff.surfaceDiffs.length}</dd></div>
            <div><dt>规则变化</dt><dd>{versionDiff.ruleDiffs.length}</dd></div>
            <div><dt>未决项</dt><dd>{versionDiff.impact.unresolved.length}</dd></div>
          </dl>
          {versionDiff.impact.impacts.length > 0 && <div className="version-impact-details" aria-label="可计算影响明细">
            {versionDiff.impact.impacts.slice(0, 4).map((impact) => impact.kind === 'clearance'
              ? <p key={impact.clearanceZoneId}><strong>{impact.label}</strong><span>{impact.beforeAvailableMm} → {impact.afterAvailableMm} mm</span><small>保护区占用 · demo</small></p>
              : <p key={impact.kind}><strong>柜体收纳估算</strong><span>{impact.beforeM3} → {impact.afterM3} m³</span><small>按外包围盒 · source: {impact.source}</small></p>)}
          </div>}
          {versionDiff.impact.unresolved.length > 0 && <div className="version-unresolved"><strong>仍不能确定</strong>{versionDiff.impact.unresolved.slice(0, 3).map((item) => <p key={`${item.code}-${item.objectId ?? ''}`}>{item.reason}<small>source: {item.source ?? 'estimate'}</small></p>)}</div>}
          <button className="version-restore" type="button" onClick={restoreComparedVersion} disabled={compareFromVersion.id === currentVersion.id || hasUnsavedChanges || Boolean(pendingReview)}><ClockCounterClockwise size={15} />以 {compareFromVersion.label} 继续，创建新版本</button>
        </section>
      </aside>
    </div>}
  </main>;
}

const latestLocalProject = () => {
  const { history } = createInitialVersionProject();
  return { history, consensus: createInitialHouseholdProject(history) };
};

const routeSlug = (pathname, section) => {
  const parts = pathname.split('/').filter(Boolean);
  return parts[0] === section ? parts[1] ?? null : null;
};

function useExportPayload(versionId) {
  const [{ history, consensus }] = useState(latestLocalProject);
  const fallback = useMemo(() => ({
    packet: buildHandoffPacket(history, consensus),
    review: buildDesignerReview(history, consensus),
    reviewDecision: null,
    source: 'local',
  }), [consensus, history]);
  const [state, setState] = useState({ status: 'loading', data: fallback, error: null });

  useEffect(() => {
    let alive = true;
    const query = versionId ? `?versionId=${encodeURIComponent(versionId)}` : '';
    fetchJson(`/api/projects/${PROJECT_ID}/export${query}`)
      .then((data) => { if (alive) setState({ status: 'ready', data: { ...data, source: 'server' }, error: null }); })
      .catch((error) => { if (alive) setState({ status: 'fallback', data: fallback, error: error.message }); });
    return () => { alive = false; };
  }, [fallback, versionId]);

  return state;
}

function DesignerReviewPage() {
  const [pathname, navigate] = usePathname();
  const versionId = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search).get('versionId');
  const exportState = useExportPayload(versionId);
  const packet = exportState.data.packet;
  const review = exportState.data.review;
  const [decision, setDecision] = useState(exportState.data.reviewDecision?.decision ?? 'pending');
  const [notes, setNotes] = useState('');
  const [submitState, setSubmitState] = useState({ status: 'idle', message: '', handoffUrl: null });
  const projectId = routeSlug(pathname, 'review') ?? 'project-demo';
  const issueCount = (review.ruleIssues?.length ?? 0) + (review.unresolved?.length ?? 0);
  const displayedReviewStatus = decision === 'approved'
    ? 'designer_verified'
    : decision === 'returned'
      ? 'designer_returned'
      : review.status;
  useEffect(() => {
    if (exportState.data.reviewDecision?.decision) setDecision(exportState.data.reviewDecision.decision);
  }, [exportState.data.reviewDecision?.decision]);
  const submitReview = async (nextDecision) => {
    if (!packet?.version?.id) return;
    setSubmitState({ status: 'pending', message: '正在写入复核决定…', handoffUrl: null });
    try {
      const result = await fetchJson(`/api/versions/${packet.version.id}/review`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision: nextDecision, notes }),
      });
      setDecision(nextDecision);
      setSubmitState({
        status: 'synced',
        message: nextDecision === 'approved' ? '已批准，可进入交接单。' : '已退回客户工作台修改。',
        handoffUrl: result.handoffUrl,
      });
    } catch (error) {
      setSubmitState({ status: 'failed', message: `复核失败：${error.message}`, handoffUrl: null });
    }
  };

  return <main className="handoff-shell">
    <header className="handoff-hero">
      <div><p className="eyebrow">Gate 11 · Designer Review</p><h1>设计师复核</h1><p>只读查看家庭确认版本、规则告警、版本差异和企业数据缺口；不混进客户工作台。</p></div>
      <div className="handoff-actions">
        <button className="utility-button" type="button" onClick={() => navigate('/project/demo')}>返回客户工作台</button>
        <button className="utility-button" type="button" onClick={() => navigate(`/handoff/${review.currentVersionId}`)}>查看交接单</button>
      </div>
    </header>
    {exportState.status === 'loading' && <p className="handoff-notice">正在读取服务器交接快照…</p>}
    {exportState.status === 'fallback' && <p className="handoff-notice">当前为本地演示数据模式；企业复核服务尚未连接。</p>}

    <section className="handoff-grid">
      <article className="panel handoff-card">
        <span>项目 / 版本</span><strong>{review.projectId} · {review.currentVersionLabel}</strong>
        <dl><div><dt>状态</dt><dd>{versionStatusLabels[displayedReviewStatus] ?? displayedReviewStatus}</dd></div><div><dt>规则</dt><dd>{ruleStatusLabels[review.ruleStatus] ?? review.ruleStatus}</dd></div><div><dt>待处理</dt><dd>{issueCount}</dd></div></dl>
      </article>
      <article className="panel handoff-card">
        <span>服务状态</span><strong>{exportState.status === 'loading' ? '正在读取服务状态…' : `${capabilityLabel(review.capability.aily, 'Aily')} / ${capabilityLabel(review.capability.base, '飞书留痕')}`}</strong>
        <p>页面只展示真实 capability 或本地降级，不声明已接通欧派生产、报价或 BOM。</p>
      </article>
      <article className="panel handoff-card">
        <span>设计师决定</span><strong>{decision === 'approved' ? '已批准' : decision === 'returned' ? '已退回' : '待复核'}</strong>
        <textarea rows="3" maxLength="1000" aria-label="复核备注" placeholder="复核备注，选填" value={notes} onChange={(event) => setNotes(event.currentTarget.value)} />
        {decision === 'pending'
          ? <div className="handoff-actions"><button type="button" onClick={() => submitReview('approved')} disabled={submitState.status === 'pending' || exportState.data.source !== 'server'}>批准进入交接</button><button type="button" onClick={() => submitReview('returned')} disabled={submitState.status === 'pending' || exportState.data.source !== 'server'}>退回修改</button></div>
          : <p className="handoff-notice" data-status="synced">复核决定已写入版本链；如需改变结论，请回到客户工作台创建新版本。</p>}
        {submitState.message && <p className="handoff-notice" data-status={submitState.status}>{submitState.message}{submitState.handoffUrl && <> <button type="button" onClick={() => navigate(submitState.handoffUrl)}>打开交接单</button></>}</p>}
      </article>
    </section>

    <section className="panel handoff-section">
      <div className="handoff-section__title"><span>真实差异</span><strong>{review.objectDiffs.length + (review.surfaceDiffs?.length ?? 0)} 项变化</strong></div>
      <ul>{review.objectDiffs.length || review.surfaceDiffs?.length
        ? <>{review.objectDiffs.map((diff, index) => <li key={`${diff.objectId}-${diff.kind}-${index}`}><b>{diffKindLabels[diff.kind] ?? diff.kind}</b><span>{objectLabels[diff.objectId] ?? diff.objectId}</span></li>)}{(review.surfaceDiffs ?? []).map((diff, index) => <li key={`${diff.surfaceId}-${diff.kind}-${index}`}><b>饰面</b><span>{diff.surfaceId}</span></li>)}</>
        : <li>当前版本与基准版本无对象或表面差异。</li>}</ul>
    </section>

    <section className="panel handoff-section">
      <div className="handoff-section__title"><span>规则与未决项</span><strong>{issueCount ? '需说明边界' : '可批准'}</strong></div>
      <ul>{[...(review.ruleIssues ?? []), ...(review.unresolved ?? [])].map((item, index) => <li key={`${item.code}-${index}`}><b>{item.status ?? '未决'}</b><span>{item.message ?? item.reason}</span><small>source: {item.source ?? 'estimate'}</small></li>)}</ul>
    </section>
  </main>;
}

function HandoffPage() {
  const [pathname, navigate] = usePathname();
  const [copyStatus, setCopyStatus] = useState('复制 JSON');
  const requestedVersionId = routeSlug(pathname, 'handoff');
  const exportState = useExportPayload(requestedVersionId);
  const packet = exportState.data.packet;
  const serializedPacket = useMemo(() => JSON.stringify(packet, null, 2), [packet]);
  const copyPacket = async () => {
    try { await navigator.clipboard.writeText(serializedPacket); setCopyStatus('已复制'); }
    catch { setCopyStatus('复制失败'); }
    window.setTimeout(() => setCopyStatus('复制 JSON'), 1200);
  };
  const downloadPacket = () => {
    const blob = new Blob([serializedPacket], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${packet.version.id}-handoff.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return <main className="handoff-shell">
    <header className="handoff-hero">
      <div><p className="eyebrow">Gate 11 · Downstream Handoff</p><h1>共识交接单</h1><p>脱敏、机器可读；真实欧派 SKU / 报价 / BOM / 生产接口仍以 pending 字段预留。</p></div>
      <div className="handoff-actions"><button className="utility-button" type="button" onClick={() => navigate('/review/project-demo')}>设计师复核</button><button className="utility-button" type="button" onClick={() => navigate('/project/demo')}>返回工作台</button></div>
    </header>
    {exportState.status === 'loading' && <p className="handoff-notice">正在读取服务器交接快照…</p>}
    {exportState.status === 'fallback' && <p className="handoff-notice">当前为本地演示数据模式；企业交接服务尚未连接。</p>}

    <section className="handoff-grid">
      <article className="panel handoff-card"><span>版本</span><strong>{packet.version.label}</strong><p>{versionStatusLabels[packet.version.status] ?? packet.version.status} · source: {packet.version.source}</p></article>
      <article className="panel handoff-card"><span>对象 / 表面</span><strong>{packet.confirmedObjects.length} / {packet.confirmedSurfaces?.length ?? 0}</strong><p>对象与饰面都保留 demo / estimate 来源，不冒充真实产品库。</p></article>
      <article className="panel handoff-card"><span>未决</span><strong>{packet.unresolved.length}</strong><p>{downstreamValueLabels[packet.downstreamPlaceholders.pricing] ?? packet.downstreamPlaceholders.pricing}</p></article>
    </section>

    <section className="panel handoff-section">
      <div className="handoff-section__title"><span>下游占位</span><strong>等待企业数据</strong></div>
      <ul>{Object.entries(packet.downstreamPlaceholders).map(([key, value]) => <li key={key}><b>{downstreamLabels[key] ?? key}</b><span>{downstreamValueLabels[value] ?? value}</span></li>)}</ul>
    </section>

    <details className="panel handoff-json">
      <summary><span><b>开发接口 JSON</b><small>{serializedPacket.length.toLocaleString()} bytes · 可复制或下载</small></span><span>展开原始数据</span></summary>
      <div className="evidence__json-header"><div><p className="evidence__label">Consensus JSON</p><span className="panel__meta">机器可读 · source 字段已保留</span></div><div className="handoff-actions"><button className="utility-button" type="button" onClick={copyPacket}>{copyStatus}</button><button className="utility-button" type="button" onClick={downloadPacket}>下载 JSON</button></div></div>
      <textarea className="json" readOnly spellCheck="false" value={serializedPacket} aria-label="共识交接 JSON" />
    </details>
  </main>;
}

export default function App() {
  const [pathname, navigate] = usePathname();
  const isProd = import.meta.env.PROD;
  const isLabRoute = pathname.startsWith('/lab/scene');
  const demoRoute = pathname === '/' || pathname === '/index.html' || pathname.startsWith('/project/demo');
  const page = demoRoute
    ? <ProjectDemoPage />
    : pathname.startsWith('/review/')
      ? <DesignerReviewPage />
      : pathname.startsWith('/handoff/')
        ? <HandoffPage />
        : isLabRoute && !isProd
          ? <LabScenePage />
          : <ProjectDemoPage />;

  useEffect(() => {
    if (pathname === '/' || pathname === '/index.html') navigate('/project/demo');
    else if (isProd && isLabRoute) navigate('/project/demo');
  }, [isLabRoute, isProd, navigate, pathname]);

  useEffect(() => {
    const title = pathname.startsWith('/review/')
      ? '设计师复核 · 欧派 AI 共识工作台'
      : pathname.startsWith('/handoff/')
        ? '共识交接单 · 欧派 AI 共识工作台'
        : pathname.startsWith('/project/demo') || pathname === '/' || pathname === '/index.html'
          ? '欧派 AI 共识工作台'
          : pathname.startsWith('/lab/scene')
            ? '欧派 AI 共识工作台 · 内部技术页'
            : '欧派 AI 共识工作台';
    document.title = title;
  }, [pathname]);

  return page;
}
