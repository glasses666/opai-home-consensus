const value = number => Number.isFinite(number) ? String(Math.round(number * 100) / 100) : '未提供';

export function describeWorkbenchDiff(diff, beforeMaterials = [], afterMaterials = []) {
  if (diff.kind === 'material') {
    const name = (id, materials) => materials.find(material => material.id === id)?.name ?? id ?? '无';
    return `${name(diff.before, beforeMaterials)} → ${name(diff.after, afterMaterials)}`;
  }
  if (diff.kind === 'transform') {
    const position = transform => `x ${value(transform?.x)} / y ${value(transform?.y)} / z ${value(transform?.z)} mm；旋转 ${value((transform?.rotationY ?? 0) * 180 / Math.PI)}°`;
    return `${position(diff.before)} → ${position(diff.after)}`;
  }
  if (diff.kind === 'dimensions') {
    const size = dimensions => `${value(dimensions?.width)} × ${value(dimensions?.depth)} × ${value(dimensions?.height)} mm`;
    return `${size(diff.before)} → ${size(diff.after)}（宽×深×高）`;
  }
  if (diff.kind === 'model') return `${diff.before?.src ?? '无'} → ${diff.after?.src ?? '无'}`;
  return '';
}
