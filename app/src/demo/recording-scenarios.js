import { createSceneStore, dispatchSceneCommand } from '../domain/scene.js';
import { createDemoScene } from '../domain/demo-scene.js';
import recordingBaselineScene from './recording-baseline-scene.json' with { type: 'json' };

export const createRecordingBaseline = () => createSceneStore(recordingBaselineScene);
const recordingFinalScene = createDemoScene();
const finalObject = (id) => recordingFinalScene.objects.find((object) => object.id === id);
const finalMaterial = (id) => recordingFinalScene.materials.find((material) => material.id === id);

export const recordingScenarios = [
  {
    id: 'family-living-flow',
    trigger: '父母一个月只来三天，平时要让孩子在客厅和餐厅之间自由活动，但父母来的时候要坐得舒服。',
    roomId: 'room-living-dining',
    viewId: 'camera-living-overhead',
    selectedId: 'object-dining-table',
    calloutReason: '用圆桌释放门口和连续动线，同时给父母舒适坐席',
    reply: '我把方桌换成三座圆桌并移出门口，把沙发、茶几和单椅收成完整会客组，中间通道不放家具。父母来时有带靠背的独立座位，孩子平时仍能从客厅连续走到餐区。墙面只用一处浅木饰面建立边界，避免整屋都变成同一种颜色。',
    commands: [
      { type: 'object.setTransform', objectId: 'object-sofa', transform: { x: 1500, z: 4800, rotationY: 0 } },
      { type: 'object.setTransform', objectId: 'object-coffee-table', transform: { x: 2000, z: 6100, rotationY: 0 } },
      { type: 'object.setTransform', objectId: 'object-lounge-chair', transform: { x: 3400, z: 6100, rotationY: -Math.PI / 2 } },
      { type: 'object.delete', objectId: 'object-dining-chair-e' },
      { type: 'object.setTransform', objectId: 'object-dining-chair-s', transform: { x: 6200, z: 6650, rotationY: Math.PI } },
      { type: 'object.setTransform', objectId: 'object-dining-chair-w', transform: { x: 5300, z: 6500, rotationY: Math.PI / 2 }, trace: false },
      { type: 'object.setTransform', objectId: 'object-dining-table', transform: { x: 6200, z: 5600, rotationY: 0 } },
      { type: 'object.setDimensions', objectId: 'object-dining-table', dimensions: { width: 1300, depth: 1300, height: 740 } },
      { type: 'object.setModelAsset', objectId: 'object-dining-table', model3D: { src: '/assets/models/dining-table.glb' }, media2D: { src: '/assets/furniture/dining-table-top.png' } },
      { type: 'object.setTransform', objectId: 'object-dining-chair-n', transform: { x: 6200, z: 4550, rotationY: 0 } },
      { type: 'object.setTransform', objectId: 'object-dining-chair-w', transform: { x: 5250, z: 5600, rotationY: Math.PI / 2 } },
      { type: 'surface.setMaterial', surfaceId: 'surface-wall-living-south', materialId: 'mat-wall-greige' },
      { type: 'surface.setMaterial', surfaceId: 'surface-wall-living-east-entry', materialId: 'mat-wall-oak-panel' },
    ],
  },
  {
    id: 'child-room-growth',
    trigger: '孩子现在六岁，两年后要有专注的学习桌和书架，但现在还需要地面玩耍空间。能不能让这个房间陪他长到十岁？',
    roomId: 'room-flex',
    viewId: 'camera-flex-overhead',
    selectedId: 'object-flex-desk',
    calloutReason: '保留中央玩耍区，并预留未来学习功能',
    reply: '我把床与书桌收向两侧，补上一把学习椅，并加宽、抬高墙面书架，中央继续留给孩子玩耍。床用更活泼的点缀色提示当前儿童阶段；两年后书桌和书架可以直接承接学习功能，不必重做房间。',
    commands: [
      { type: 'material.add', material: finalMaterial('mat-flex-accent-fabric') },
      { type: 'object.setTransform', objectId: 'object-flex-bed', transform: { x: 7700, z: 1400, rotationY: 0 } },
      { type: 'object.setMaterial', objectId: 'object-flex-bed', materialId: 'mat-flex-accent-fabric' },
      { type: 'object.setTransform', objectId: 'object-flex-desk', transform: { x: 10650, z: 1600, rotationY: Math.PI / 2 } },
      { type: 'object.setModelAsset', objectId: 'object-flex-floating-shelf', model3D: { src: '/assets/models/floating-shelf.glb' }, dimensions: { width: 1000, depth: 260, height: 720 }, transform: { x: 10350, y: 1350, z: 150, rotationY: 0 } },
      { type: 'object.add', object: finalObject('object-flex-chair') },
    ],
  },
  {
    id: 'bedroom-shared-comfort',
    trigger: '我妻子希望主卧安静温暖，我需要更多收纳，但我们都不想让柜子显得压迫。能不能一起解决？',
    roomId: 'room-primary-bedroom',
    viewId: 'camera-primary-feature',
    selectedId: 'object-primary-feature-wall',
    calloutReason: '收纳不减少，用轻量柜体、木格栅和艺术画降低压迫感',
    reply: '我保留衣柜容量，把柜门换成暖白轻量立面；床向内收，床头改成更薄的木格栅背景墙，并挂上暖灰矿物抽象画作为视觉焦点。这样收纳不减少，主卧也更安静完整；柜内分区仍需真实产品目录接入后复核。',
    commands: [
      { type: 'object.setTransform', objectId: 'object-primary-bed', transform: { x: 1500, z: 1500, rotationY: 0 } },
      { type: 'object.setModelAsset', objectId: 'object-primary-bed', model3D: { src: '/assets/models/double-bed.glb' } },
      { type: 'object.setMaterial', objectId: 'object-primary-wardrobe', materialId: 'mat-object-warm-white' },
      { type: 'object.setModelAsset', objectId: 'object-primary-wardrobe', model3D: { src: '/assets/models/wardrobe.glb' }, transform: { x: 3600, z: 1200, rotationY: -Math.PI / 2 } },
      { type: 'object.setModelAsset', objectId: 'object-primary-feature-wall', model3D: { src: '/assets/models/feature-wall.glb' }, dimensions: { width: 3000, depth: 120, height: 2100 }, transform: { x: 1500, z: 2920, rotationY: Math.PI }, media2D: { src: '/assets/furniture/feature-wall-top.png' }, wallArt: finalObject('object-primary-feature-wall').wallArt },
    ],
  },
];

export const findRecordingScenario = (input) => recordingScenarios.find((scenario) => scenario.trigger === String(input ?? '').trim()) ?? null;

const toolCallForCommand = (command) => {
  if (command.type === 'object.setTransform') return { tool: 'move_object', args: { objectId: command.objectId, ...command.transform } };
  if (command.type === 'object.setMaterial') return { tool: 'set_object_material', args: { objectId: command.objectId, materialId: command.materialId } };
  if (command.type === 'object.setDimensions') return { tool: 'resize_object', args: { objectId: command.objectId, ...command.dimensions } };
  if (command.type === 'object.setModelAsset') return { tool: 'replace_object_model', args: { objectId: command.objectId, src: command.model3D.src } };
  if (command.type === 'object.delete') return { tool: 'delete_object', args: { objectId: command.objectId } };
  if (command.type === 'object.add') return { tool: 'add_object', args: { objectId: command.object.id } };
  if (command.type === 'material.add') return { tool: 'add_material', args: { materialId: command.material.id } };
  return { tool: 'set_surface_material', args: { surfaceId: command.surfaceId, materialId: command.materialId } };
};

export function runRecordingScenario(store, input) {
  const scenario = findRecordingScenario(input);
  if (!scenario) return null;
  let nextStore = store;
  const toolCalls = scenario.commands.filter((command) => command.trace !== false).map(toolCallForCommand);
  for (const command of scenario.commands) nextStore = dispatchSceneCommand(nextStore, command);
  return {
    store: nextStore,
    scenario,
    trace: {
      assistantReply: scenario.reply,
      designBrief: null,
      fallbackReason: null,
      input: scenario.trigger,
      mode: 'execute',
      reasons: [],
      rolledBack: false,
      source: 'demo-script',
      steps: toolCalls.map((call) => ({ ok: true, tool: call.tool, args: call.args, result: call.args })),
      toolCalls,
      unresolved: [],
    },
  };
}
