import React from 'react';
import { useDiscussion } from './family/useDiscussion.js';
import RecommendedWorkspace from './family/RecommendedWorkspace.jsx';
// Preserve the baseline test/import surface and the existing REST/onAdopt contract.
export { createDiscussionActionState, summarySources, summaryItemPresentation, opinionPresentation } from './family/domain.js';
export default function ExperienceDiscussion({ path, headers, versionId, versionLabel, requirements, disabled, onAdopt, onClose }) {
  const controller = useDiscussion({ path, headers, versionId, versionLabel, requirements, disabled, onAdopt });
  return <RecommendedWorkspace c={controller} onReturn={onClose}/>;
}
