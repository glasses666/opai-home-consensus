import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createReferenceHome } from '../src/domain/reference-home.js';

const ambientHouse = readFileSync(new URL('../src/AmbientHouse.jsx', import.meta.url), 'utf8');
const homePreview = readFileSync(new URL('../src/HomePreview.jsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

test('Demo homepage autoplays the existing 1080p 60fps hero asset', () => {
  assert.match(ambientHouse, /useState\(true\)/);
  assert.match(ambientHouse, /autoPlay preload="auto" muted loop playsInline/);
  assert.match(ambientHouse, /src="\/assets\/hero\/house-graded-v25\.mp4"/);
  assert.doesNotMatch(ambientHouse, /house-web-v26\.mp4/);
  assert.doesNotMatch(ambientHouse, /ha-motion-control|暂停背景动画|播放背景动画/);
});

test('all new-design entry points restore the detailed selector flow', () => {
  assert.equal((homePreview.match(/href="\/projects\/new\/details\/start"/g) ?? []).length, 3);
  assert.match(app, /project-tile project-tile--new" href="\/projects\/new\/details\/start"/);
  assert.match(app, /pathname === '\/projects\/new\/details\/start'[\s\S]*removeItem\(PROJECT_SETUP_KEY\)[\s\S]*removeItem\(PROJECT_GENERATION_KEY\)[\s\S]*createProjectSetup\(\)/);
  assert.match(app, /const setupSteps = \[[\s\S]*'source'[\s\S]*'floorplan'[\s\S]*'budget'[\s\S]*'household'[\s\S]*'style'[\s\S]*'summary'/);
});

test('the generation transition restores the original plan-building loading animation', () => {
  const generation = app.slice(app.indexOf('function ProjectGenerationPage()'), app.indexOf('function findEntity'));
  assert.match(generation, /autoPlay loop muted playsInline preload="auto"/);
  assert.match(generation, /poster="\/assets\/hero\/villa-hero-placeholder\.png"/);
  assert.match(generation, /<source src="\/assets\/hero\/villa-plan-loading-loop\.mp4"/);
  assert.doesNotMatch(generation, /house-web-v26\.mp4/);
  assert.match(generation, /fetchEntryWithRetry\('\/api\/experience\/projects'/);
  assert.match(generation, /persistExperienceToken\(project\.projectId, project\.accessToken\)/);
  assert.doesNotMatch(generation, /\/api\/projects\/project-demo\/first-plan/);
});

test('floor-plan confirmation renders the same canonical scene used by new experience projects', () => {
  const referenceHome = createReferenceHome();
  assert.equal(referenceHome.rooms.length, 9);
  assert.match(app, /const referenceScene = createReferenceHome\(\)/);
  assert.match(app, /<ProjectPlanPreview sceneModel=\{referenceScene\}/);
  assert.match(app, /\{referenceScene\.rooms\.length\} 个空间/);
});
