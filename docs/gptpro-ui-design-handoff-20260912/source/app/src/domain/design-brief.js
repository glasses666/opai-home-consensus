const FIELDS = ['goals', 'hardConstraints', 'softPreferences', 'confirmedObjects', 'unresolvedIssues'];
const MAX_ITEMS = 24;
const MAX_TEXT = 180;

const freezeBrief = (brief) => Object.freeze(Object.fromEntries([
  ['schemaVersion', 1],
  ...FIELDS.map((field) => [field, Object.freeze([...brief[field]])]),
]));

export const createDesignBrief = () => freezeBrief(Object.fromEntries(FIELDS.map((field) => [field, []])));

export function normalizeDesignBrief(value) {
  if (value == null) return createDesignBrief();
  if (value.schemaVersion !== 1) throw new Error('DESIGN_BRIEF_INVALID');
  const brief = {};
  for (const field of FIELDS) {
    if (!Array.isArray(value[field]) || value[field].length > MAX_ITEMS || value[field].some((item) => typeof item !== 'string' || !item.trim() || item.length > MAX_TEXT)) {
      throw new Error('DESIGN_BRIEF_INVALID');
    }
    brief[field] = [...new Set(value[field].map((item) => item.trim()))];
  }
  return freezeBrief(brief);
}

const add = (items, value) => value && !items.includes(value) ? [...items, value].slice(-MAX_ITEMS) : items;

export function evolveDesignBrief(value, {
  input = '',
  activeRoomId = null,
  selectedObjectId = null,
  steps = [],
  goals: proposedGoals = [],
  hardConstraints: proposedHardConstraints = [],
  softPreferences: proposedSoftPreferences = [],
  confirmedObjects: proposedConfirmedObjects = [],
  unresolvedIssues: proposedUnresolvedIssues = [],
} = {}) {
  const current = normalizeDesignBrief(value);
  const text = String(input).trim();
  let goals = [...current.goals];
  let hardConstraints = [...current.hardConstraints];
  let softPreferences = [...current.softPreferences];
  let confirmedObjects = [...current.confirmedObjects];
  let unresolvedIssues = [...current.unresolvedIssues];

  for (const goal of proposedGoals) goals = add(goals, goal);
  for (const constraint of proposedHardConstraints) hardConstraints = add(hardConstraints, constraint);
  for (const preference of proposedSoftPreferences) softPreferences = add(softPreferences, preference);
  for (const objectId of proposedConfirmedObjects) confirmedObjects = add(confirmedObjects, objectId);
  for (const issue of proposedUnresolvedIssues) unresolvedIssues = add(unresolvedIssues, issue);

  const roomName = activeRoomId === 'room-primary-bedroom' ? '主卧' : activeRoomId === 'room-flex' ? '儿童房 / 书房' : activeRoomId;
  if (/(太满|拥挤|开阔|动线)/.test(text)) goals = add(goals, roomName ? `${roomName}不太满、空间更开阔` : '空间不太满、更开阔');
  if (/收纳/.test(text)) goals = add(goals, roomName ? `${roomName}保留或增加收纳` : '保留或增加收纳');
  if (/(收纳.{0,5}(?:别|不能|不要).{0,3}少|不能减少收纳)/.test(text)) hardConstraints = add(hardConstraints, '收纳量不减少');
  if (/(预算|省一点|便宜|控制成本)/.test(text)) softPreferences = add(softPreferences, '控制预算');
  if (/(暖白|浅木|橡木|暖灰|北欧|简洁)/.test(text)) softPreferences = add(softPreferences, text.match(/暖白|浅木|橡木|暖灰|北欧|简洁/)?.[0]);
  if (selectedObjectId?.startsWith('object-') && /(?:保留|确认|确定).{0,8}(?:这个|这件|当前|家具|柜|床|桌|沙发)/.test(text)) confirmedObjects = add(confirmedObjects, selectedObjectId);

  const question = steps.find((step) => step.ok && step.tool === 'request_clarification')?.result?.question;
  if (question) unresolvedIssues = add(unresolvedIssues, question);

  return normalizeDesignBrief({ schemaVersion: 1, goals, hardConstraints, softPreferences, confirmedObjects, unresolvedIssues });
}

export const serializeDesignBrief = (brief) => JSON.stringify(normalizeDesignBrief(brief));

export function deserializeDesignBrief(serialized) {
  if (typeof serialized !== 'string') throw new Error('DESIGN_BRIEF_INVALID');
  try {
    return normalizeDesignBrief(JSON.parse(serialized));
  } catch (error) {
    if (error?.message === 'DESIGN_BRIEF_INVALID') throw error;
    throw new Error('DESIGN_BRIEF_INVALID');
  }
}
