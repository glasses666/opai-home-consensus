import { resolve, join } from 'node:path';
import { createExperienceStore } from './experience-store.mjs';
import { createExperienceRoutes } from './experience-routes.mjs';
import { createHouseKnowledgeStore } from './house-knowledge.mjs';
import { createFamilyDiscussionService } from './family-discussion.mjs';

/** Same runtime for the ordinary server entry and isolated local QA. */
export function createExperienceRuntime({directory=resolve(process.env.OPAI_EXPERIENCE_DATA_DIR||'.data/experience'),provider}={}) {
  const store=createExperienceStore({directory:join(directory,'projects')});
  const knowledge=createHouseKnowledgeStore({filePath:join(directory,'knowledge.json')});
  const family=createFamilyDiscussionService({filePath:join(directory,'discussions.json'),getVersionContext:store.getVersionContext});
  return {store,knowledge,family,handler:createExperienceRoutes({store,knowledge,family,...(provider?{provider}:{})})};
}
