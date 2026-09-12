/** NON-LIVE unit fixture for unrelated regression contracts. Never imported by runtime. */
import { REVIEW_CHECKS } from '../src/agent/design-quality.js';
export function reviewFixture(data,{fail=[],detail='Fixture rejection',repair='Observe the real scene and revise the candidate'}={}) {
  const changed=data?.measuredDelta?.facts?.[0]?.factId;
  return {accepted:!fail.length,checks:Object.fromEntries(REVIEW_CHECKS.map(name=>[name,{
    pass:!fail.includes(name),reason:'Deterministic unit fixture, not a live design quality assessment.',
    factIds:changed&&['goalFit','noticeability'].includes(name)?[changed]:['user:current'],
  }])),issues:fail.map(code=>({code,detail,repair,factIds:['user:current']})),
  providerTrace:{provider:'mock',model:'deterministic-review-fixture',nonLive:true}};
}
export const approveReview=async({reviewData})=>reviewFixture(reviewData);
