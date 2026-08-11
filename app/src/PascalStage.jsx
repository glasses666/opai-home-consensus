import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { applySceneSnapshot, loadPlugin, subscribeSceneCommits } from '@pascal-app/core';
import { Editor, useEditor, useViewer } from '@pascal-app/editor';
import { builtinPlugin } from '@pascal-app/nodes';
import { projectOppeinSceneToPascal } from './pascal/oppein-to-pascal.js';
import { pascalCommitToSceneCommands } from './pascal/pascal-to-command.js';
import './pascal/pascal.css';

const BUILDING_ID = 'building_oppein_demo';
const LEVEL_ID = 'level_oppein_demo';

let pluginReady;
function ensurePascalPlugin() {
  pluginReady ??= Promise.resolve(loadPlugin(builtinPlugin));
  return pluginReady;
}

function snapshotFromProjection(projection) {
  const graph = projection.sceneGraph;
  return {
    nodes: graph.nodes,
    rootNodeIds: graph.rootNodeIds,
    collections: graph.collections ?? {},
    materials: graph.materials ?? {},
    installedPlugins: graph.installedPlugins ?? ['pascal:core'],
  };
}

export default function PascalStage({ scene, selection, onSelect, onEditCommand }) {
  const projection = useMemo(() => localizeAssetUrls(projectOppeinSceneToPascal(scene)), [scene]);
  const projectionRef = useRef(projection);
  const onEditCommandRef = useRef(onEditCommand);
  const restoringRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [editorLoaded, setEditorLoaded] = useState(false);
  const [status, setStatus] = useState('Pascal Editor 启动中');

  useEffect(() => {
    projectionRef.current = projection;
  }, [projection]);

  useEffect(() => { onEditCommandRef.current = onEditCommand; }, [onEditCommand]);

  const onLoaderChange = useCallback((visible) => setEditorLoaded(!visible), []);

  useEffect(() => {
    let mounted = true;
    ensurePascalPlugin()
      .then(() => mounted && setReady(true))
      .catch((error) => mounted && setStatus(`Pascal 插件启动失败：${error.message}`));
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!ready) return undefined;
    return subscribeSceneCommits((commit) => {
      if (!editorLoaded || restoringRef.current || commit.origin !== 'local') return;
      const commands = pascalCommitToSceneCommands(commit, projectionRef.current.mapping);
      let applied = commands.length === 1;
      if (applied) applied = Boolean(onEditCommandRef.current(commands[0]));
      if (applied) {
        setStatus(`已通过规则写入 ${commands.length} 个 SceneCommand`);
        return;
      }
      restoringRef.current = true;
      try {
        applySceneSnapshot(snapshotFromProjection(projectionRef.current), { origin: 'host' });
      } finally {
        restoringRef.current = false;
      }
      setStatus('该 Pascal 操作暂未映射到业务命令，已回到 canonical scene');
    });
  }, [editorLoaded, ready]);

  useEffect(() => {
    if (!(ready && editorLoaded)) return;
    try {
      applySceneSnapshot(snapshotFromProjection(projection), { origin: 'host' });
      setStatus('canonical scene 已同步到 Pascal');
    } catch {
      // Pascal refuses snapshot replacement during pointer interactions; next scene change retries.
    }
  }, [editorLoaded, projection, ready]);

  useEffect(() => {
    if (!(ready && editorLoaded)) return;
    const pascalId = projection.mapping.canonicalToPascal[selection?.kind]?.[selection?.id];
    useViewer.getState().setSelection({
      buildingId: BUILDING_ID,
      levelId: LEVEL_ID,
      zoneId: selection?.kind === 'room' ? pascalId : null,
      selectedIds: selection?.kind && selection.kind !== 'room' && pascalId ? [pascalId] : [],
    });
  }, [editorLoaded, projection, ready, selection?.id, selection?.kind]);

  const onLoad = useCallback(async () => snapshotFromProjection(projectionRef.current), []);
  const onSave = useCallback(async () => {}, []);

  if (!ready) return <div className="pascal-stage-loading">{status}</div>;

  return (
    <div className="pascal-stage">
      {editorLoaded && <PascalSelectionBridge mapping={projection.mapping} selection={selection} onSelect={onSelect} />}
      <PascalViewSwitch />
      <Editor
        key={scene.id}
        layoutVersion="v1"
        projectId={scene.id}
        onLoad={onLoad}
        onSave={onSave}
        onLoaderChange={onLoaderChange}
        appMenuButton={<div className="pascal-app-badge">OP</div>}
        sidebarTop={<div className="pascal-sidebar-note"><strong>{status}</strong><span>同一 canonical scene；Pascal 只负责编辑壳。</span></div>}
        viewerBanner={selection?.id ? <div className="pascal-banner">当前 canonical 选择：{selection.id}</div> : null}
      />
    </div>
  );
}

function PascalSelectionBridge({ mapping, selection, onSelect }) {
  const selectedId = useViewer((state) => state.selection.selectedIds[0] ?? null);
  const zoneId = useViewer((state) => state.selection.zoneId ?? null);
  useEffect(() => {
    const canonical = mapping.pascalToCanonical[selectedId || zoneId];
    if (!canonical || (selection?.kind === canonical.kind && selection.id === canonical.id)) return;
    onSelect({ kind: canonical.kind, id: canonical.id });
  }, [mapping, onSelect, selectedId, selection?.id, selection?.kind, zoneId]);
  return null;
}

function PascalViewSwitch() {
  const viewMode = useEditor((state) => state.viewMode);
  const setViewMode = useEditor((state) => state.setViewMode);
  return (
    <div className="pascal-view-switch" aria-label="Pascal 编辑视图">
      {[
        ['2d', '2D'],
        ['3d', '3D'],
        ['split', '分屏'],
      ].map(([mode, label]) => (
        <button key={mode} type="button" aria-pressed={viewMode === mode} onClick={() => setViewMode(mode)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function localizeAssetUrls(projection) {
  if (typeof window === 'undefined') return projection;
  const origin = window.location.origin;
  const nodes = Object.fromEntries(Object.entries(projection.sceneGraph.nodes).map(([id, node]) => {
    if (node.type !== 'item' || !node.asset) return [id, node];
    return [id, {
      ...node,
      asset: {
        ...node.asset,
        src: absoluteUrl(node.asset.src, origin),
        thumbnail: absoluteUrl(node.asset.thumbnail, origin),
        floorPlanUrl: absoluteUrl(node.asset.floorPlanUrl, origin),
      },
    }];
  }));
  return { ...projection, sceneGraph: { ...projection.sceneGraph, nodes } };
}

function absoluteUrl(value, origin) {
  if (!value || /^(https?:|data:|blob:)/.test(value)) return value;
  return new URL(value, origin).href;
}
