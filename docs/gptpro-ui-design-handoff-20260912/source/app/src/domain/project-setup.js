const SOURCE_TYPES = new Set(['upload', 'demo']);
const STEPS = new Set(['source', 'floorplan', 'budget', 'household', 'style', 'summary']);

export function createProjectSetup() {
  return {
    step: 'source',
    sourceType: null,
    fileName: '',
    floorplanConfirmed: false,
    floorplanNote: '',
    budget: null,
    members: [],
    memberDetails: {},
    styles: [],
    ready: false,
  };
}

export function normalizeProjectSetup(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('PROJECT_SETUP_INVALID');
  const cleanStrings = (items, limit) => Array.isArray(items)
    ? [...new Set(items.filter((item) => typeof item === 'string' && item.length <= 40))].slice(0, limit)
    : [];
  return Object.freeze({
    step: STEPS.has(value.step) ? value.step : 'source',
    sourceType: SOURCE_TYPES.has(value.sourceType) ? value.sourceType : null,
    fileName: typeof value.fileName === 'string' ? value.fileName.slice(0, 120) : '',
    floorplanConfirmed: value.floorplanConfirmed === true,
    floorplanNote: typeof value.floorplanNote === 'string' ? value.floorplanNote.slice(0, 80) : '',
    budget: typeof value.budget === 'string' && value.budget.length <= 40 ? value.budget : null,
    members: Object.freeze(cleanStrings(value.members, 6)),
    memberDetails: Object.freeze(Object.fromEntries(Object.entries(value.memberDetails ?? {})
      .filter(([key, item]) => typeof key === 'string' && key.length <= 40 && typeof item === 'string' && item.length <= 40)
      .slice(0, 6))),
    styles: Object.freeze(cleanStrings(value.styles, 3)),
    ready: value.ready === true,
  });
}

export function serializeProjectSetup(value) {
  return JSON.stringify(normalizeProjectSetup(value));
}

export function projectSetupFingerprint(value, step = value?.step) {
  const setup = normalizeProjectSetup(value);
  const details = Object.fromEntries(Object.entries(setup.memberDetails).sort(([left], [right]) => left.localeCompare(right)));
  const payload = {
    source: [setup.sourceType, setup.sourceType === 'upload' ? setup.fileName : ''],
    floorplan: [setup.floorplanConfirmed, setup.floorplanNote],
    budget: setup.budget,
    household: [[...setup.members].sort(), details],
    style: [...setup.styles].sort(),
  }[step];
  if (payload === undefined) throw new Error('PROJECT_SETUP_STEP_REQUIRED');
  return JSON.stringify(payload);
}

export function deserializeProjectSetup(serialized) {
  if (typeof serialized !== 'string') throw new Error('PROJECT_SETUP_SERIALIZED_REQUIRED');
  try {
    return normalizeProjectSetup(JSON.parse(serialized));
  } catch (error) {
    if (error.message?.startsWith('PROJECT_SETUP_')) throw error;
    throw new Error('PROJECT_SETUP_INVALID_JSON');
  }
}
