import { dispatchSceneCommand } from '../domain/scene.js';

export const recordingScenarios = [
  {
    id: 'family-living-flow',
    trigger: '父母一个月只来三天，平时要让孩子在客厅和餐厅之间自由活动，但父母来的时候要坐得舒服。',
    roomId: 'room-living-dining',
    viewId: 'camera-living-overhead',
    selectedId: 'object-dining-table',
    reply: '我保留餐区位置，把沙发、茶几和单椅收成完整会客组，中间通道不放家具。父母来时有带靠背的独立座位，孩子平时仍能从客厅连续走到餐区。墙面只用一处浅木饰面建立边界，避免整屋都变成同一种颜色。',
    commands: [
      { type: 'object.setTransform', objectId: 'object-sofa', transform: { x: 2050, z: 5050, rotationY: 0 } },
      { type: 'object.setTransform', objectId: 'object-coffee-table', transform: { x: 2050, z: 6300, rotationY: 0 } },
      { type: 'object.setTransform', objectId: 'object-lounge-chair', transform: { x: 3450, z: 6550, rotationY: -Math.PI / 2 } },
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
    reply: '我把床与书桌分别收向房间两侧，留下连续的中央活动区；书桌改为更轻的暖白饰面，北墙保持中性，书架所在墙用木饰面形成长期学习区。现在适合玩耍，未来只需替换家具模块，不必重做墙面。',
    commands: [
      { type: 'object.setTransform', objectId: 'object-flex-bed', transform: { x: 7600, z: 2000, rotationY: 0 } },
      { type: 'object.setTransform', objectId: 'object-flex-desk', transform: { x: 10400, z: 2500, rotationY: Math.PI / 2 } },
      { type: 'object.setMaterial', objectId: 'object-flex-desk', materialId: 'mat-object-warm-white' },
      { type: 'surface.setMaterial', surfaceId: 'surface-wall-flex-north', materialId: 'mat-wall-greige' },
      { type: 'surface.setMaterial', surfaceId: 'surface-wall-flex-east', materialId: 'mat-wall-oak-panel' },
    ],
  },
  {
    id: 'bedroom-shared-comfort',
    trigger: '我妻子希望主卧安静温暖，我需要更多收纳，但我们都不想让柜子显得压迫。能不能一起解决？',
    roomId: 'room-primary-bedroom',
    viewId: 'camera-primary-feature',
    selectedId: 'object-primary-feature-wall',
    reply: '我没有增加占地，而是用材质建立安静感：床头保留木质焦点，南墙与顶面压低明度，衣柜改为暖白哑光以减轻体量。收纳容量保持不变，房间的视觉压力更低；柜内分区仍需真实产品目录接入后复核。',
    commands: [
      { type: 'object.setMaterial', objectId: 'object-primary-wardrobe', materialId: 'mat-object-warm-white' },
      { type: 'object.setMaterial', objectId: 'object-primary-bed', materialId: 'mat-object-warm-white' },
      { type: 'object.setMaterial', objectId: 'object-primary-feature-wall', materialId: 'mat-oak-veneer' },
      { type: 'surface.setMaterial', surfaceId: 'surface-wall-primary-south', materialId: 'mat-wall-greige' },
      { type: 'surface.setMaterial', surfaceId: 'surface-ceiling-primary-bedroom', materialId: 'mat-ceiling-greige' },
    ],
  },
];

export const findRecordingScenario = (input) => recordingScenarios.find((scenario) => scenario.trigger === String(input ?? '').trim()) ?? null;

const toolCallForCommand = (command) => {
  if (command.type === 'object.setTransform') return { tool: 'move_object', args: { objectId: command.objectId, ...command.transform } };
  if (command.type === 'object.setMaterial') return { tool: 'set_object_material', args: { objectId: command.objectId, materialId: command.materialId } };
  return { tool: 'set_surface_material', args: { surfaceId: command.surfaceId, materialId: command.materialId } };
};

export function runRecordingScenario(store, input) {
  const scenario = findRecordingScenario(input);
  if (!scenario) return null;
  let nextStore = store;
  const toolCalls = scenario.commands.map(toolCallForCommand);
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
