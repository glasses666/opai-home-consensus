import { modernCalmStyleCases } from './style-cases-modern-calm.js';
import { minimalContemporaryStyleCases } from './style-cases-minimal-contemporary.js';
import { midcenturyIndustrialStyleCases } from './style-cases-midcentury-industrial.js';
import { quietNewChineseStyleCases } from './style-cases-quiet-newchinese.js';

export const designStyleCases = Object.freeze({
  id: 'design-style-cases-v1',
  schemaVersion: 1,
  generatedAt: '2026-08-12',
  usage: 'retrieval_seed_reference_only',
  disclaimer: '案例用于需求澄清、方向比较和适用性说明；不是施工规范、精确报价、企业产品数据或效果保证。',
  cases: Object.freeze([
    ...modernCalmStyleCases.cases,
    ...minimalContemporaryStyleCases.cases,
    ...midcenturyIndustrialStyleCases,
    ...quietNewChineseStyleCases,
  ]),
});
