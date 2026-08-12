import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { applySceneSnapshot, emitter, loadPlugin, subscribeSceneCommits } from '@pascal-app/core';
import { Editor, subscribeCameraPose, useEditor, useSidebarStore, useViewer } from '@pascal-app/editor';
import { builtinPlugin } from '@pascal-app/nodes';
import { projectOppeinSceneToPascal } from './pascal/oppein-to-pascal.js';
import { isResidentEditCommand, pascalCommitToSceneCommands } from './pascal/pascal-to-command.js';
import { resolveRenderProfile } from './domain/render-profile.js';
import {
  isTrackpadPanWheel,
  isTrackpadPinchWheel,
  panCameraPose,
  zoomCameraPose,
} from './pascal/trackpad-navigation.js';
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

export default function PascalStage({ scene, selection, onSelect, onEditCommand, interactionMode = 'browse', loadingFallback = null }) {
  const stageRef = useRef(null);
  const projection = useMemo(() => localizeAssetUrls(projectOppeinSceneToPascal(scene)), [scene]);
  const projectionRef = useRef(projection);
  const onEditCommandRef = useRef(onEditCommand);
  const restoringRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [editorLoaded, setEditorLoaded] = useState(false);
  const [status, setStatus] = useState('Pascal Editor 启动中');
  const renderProfile = useRenderProfile();
  const setSidebarCollapsed = useSidebarStore((state) => state.setIsCollapsed);
  const editableObjectIds = useMemo(() => new Set(scene.objects
    .filter((object) => object.capabilities.movable || object.capabilities.rotatable || object.capabilities.parameterEditable)
    .map((object) => object.id)), [scene]);

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
      let applied = interactionMode === 'quick' && commands.length === 1 && isResidentEditCommand(commands[0]);
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
      setStatus('住户微调只允许移动、旋转和尺寸调整；其他操作已撤销');
    });
  }, [editorLoaded, interactionMode, ready]);

  useEffect(() => {
    if (!(ready && editorLoaded)) return;
    const viewer = useViewer.getState();
    viewer.setSceneTheme('paper');
    viewer.setTransparentBackground(true);
    viewer.setShading('rendered');
    viewer.setTextures(true);
    viewer.setShadows(true);
    try {
      applySceneSnapshot(snapshotFromProjection(projection), { origin: 'host' });
      setStatus('canonical scene 已同步到 Pascal');
    } catch {
      // Pascal refuses snapshot replacement during pointer interactions; next scene change retries.
    }
  }, [editorLoaded, projection, ready]);

  useEffect(() => {
    if (!editorLoaded) return undefined;
    setSidebarCollapsed(true);
    useEditor.getState().setMode('select');
    const resizeTimer = window.setTimeout(() => window.dispatchEvent(new Event('resize')), 180);
    return () => window.clearTimeout(resizeTimer);
  }, [editorLoaded, interactionMode, setSidebarCollapsed]);

  useEffect(() => {
    if (!(ready && editorLoaded)) return;
    const editableSelection = interactionMode === 'quick' && selection?.kind === 'object' && editableObjectIds.has(selection.id);
    const pascalId = editableSelection ? projection.mapping.canonicalToPascal.object[selection.id] : null;
    useViewer.getState().setSelection({
      buildingId: BUILDING_ID,
      levelId: LEVEL_ID,
      zoneId: null,
      selectedIds: pascalId ? [pascalId] : [],
    });
  }, [editableObjectIds, editorLoaded, interactionMode, projection, ready, selection?.id, selection?.kind]);

  const onLoad = useCallback(async () => snapshotFromProjection(projectionRef.current), []);
  const onSave = useCallback(async () => {}, []);

  if (!ready) return <div className="pascal-stage-loading">{status}</div>;
  if (!renderProfile.allowHeavy3D) return <div className="pascal-stage-loading" data-render-profile="paused">页面暂时隐藏，装修编辑器已暂停以节省资源。</div>;

  return (
    <div ref={stageRef} className="pascal-stage" data-interaction={interactionMode} data-render-profile={renderProfile.mode}>
      {!editorLoaded && <div className="pascal-loading-preview" role="status">{loadingFallback ?? '正在载入实时 3D…'}</div>}
      {editorLoaded && interactionMode === 'browse' && <PascalBrowseSelectionBridge mapping={projection.mapping} nodes={projection.sceneGraph.nodes} onSelect={onSelect} />}
      {editorLoaded && interactionMode === 'quick' && <PascalSelectionBridge editableObjectIds={editableObjectIds} mapping={projection.mapping} selection={selection} onSelect={onSelect} />}
      {editorLoaded && <PascalResidentModeGuard interactionMode={interactionMode} />}
      {editorLoaded && <PascalTrackpadNavigation rootRef={stageRef} />}
      <PascalViewSwitch renderProfile={renderProfile} />
      {renderProfile.mode === 'light' && <div className="pascal-resource-badge">轻量模式 · 默认 2D</div>}
      {editorLoaded && <div className="pascal-trackpad-hint">双指平移 · 捏合缩放 · 右键旋转</div>}
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

function PascalTrackpadNavigation({ rootRef }) {
  const viewMode = useEditor((state) => state.viewMode);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || viewMode === '2d') return undefined;

    let pose = null;
    let desiredPose = null;
    let gestureUntil = 0;
    let frame = 0;
    let deltaX = 0;
    let deltaY = 0;
    let pinchDelta = 0;
    const unsubscribe = subscribeCameraPose((nextPose) => {
      pose = nextPose;
      if (performance.now() >= gestureUntil) desiredPose = nextPose;
    });

    const flush = (canvas) => {
      frame = 0;
      const basePose = pinchDelta ? zoomCameraPose(desiredPose || pose, pinchDelta) : desiredPose || pose;
      const nextPose = (deltaX || deltaY) ? panCameraPose(basePose, {
        deltaX,
        deltaY,
        viewportWidth: canvas.clientWidth,
      }) : basePose;
      deltaX = 0;
      deltaY = 0;
      pinchDelta = 0;
      if (!nextPose) return;
      desiredPose = nextPose;
      emitter.emit('camera-controls:apply-pose', nextPose);
    };

    const onWheel = (event) => {
      if (!(event.target instanceof HTMLCanvasElement)) return;
      const now = performance.now();
      const pinch = isTrackpadPinchWheel(event);
      if (!pinch && !isTrackpadPanWheel(event, now < gestureUntil)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      gestureUntil = now + 180;
      if (pinch) pinchDelta += event.deltaY;
      else {
        deltaX += event.deltaX;
        deltaY += event.deltaY;
      }
      if (!frame) frame = requestAnimationFrame(() => flush(event.target));
    };

    root.addEventListener('wheel', onWheel, { capture: true, passive: false });
    return () => {
      root.removeEventListener('wheel', onWheel, { capture: true });
      unsubscribe();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [rootRef, viewMode]);

  return null;
}

function PascalSelectionBridge({ editableObjectIds, mapping, selection, onSelect }) {
  const selectedId = useViewer((state) => state.selection.selectedIds[0] ?? null);
  useEffect(() => {
    const canonical = mapping.pascalToCanonical[selectedId];
    if (canonical && (canonical.kind !== 'object' || !editableObjectIds.has(canonical.id))) {
      useViewer.getState().setSelection({ selectedIds: [] });
      return;
    }
    if (!canonical || (selection?.kind === canonical.kind && selection.id === canonical.id)) return;
    onSelect({ kind: canonical.kind, id: canonical.id });
  }, [editableObjectIds, mapping, onSelect, selectedId, selection?.id, selection?.kind]);
  return null;
}

function PascalBrowseSelectionBridge({ mapping, nodes, onSelect }) {
  useEffect(() => {
    const types = new Set(Object.values(nodes).map((node) => node.type));
    const clearEditorSelection = () => {
      if (useViewer.getState().selection.selectedIds.length) {
        useViewer.getState().setSelection({ selectedIds: [], zoneId: null });
      }
    };
    const handleClick = (event) => {
      const canonical = mapping.pascalToCanonical[event.node?.id];
      if (canonical && canonical.kind !== 'material') onSelect(canonical);
      clearEditorSelection();
    };
    for (const type of types) emitter.on(`${type}:click`, handleClick);
    const unsubscribe = useViewer.subscribe(clearEditorSelection);
    clearEditorSelection();
    return () => {
      unsubscribe();
      for (const type of types) emitter.off(`${type}:click`, handleClick);
    };
  }, [mapping, nodes, onSelect]);
  return null;
}

function PascalResidentModeGuard({ interactionMode }) {
  useEffect(() => {
    useEditor.getState().setWorkspaceMode('edit');
    useEditor.getState().setCaptureMode(interactionMode === 'browse');
    useEditor.getState().setMode('select');
    const unsubscribe = useEditor.subscribe((state) => {
      if (state.mode !== 'select') useEditor.getState().setMode('select');
    });
    const blockHiddenEditorShortcuts = (event) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      const blocked = event.key === 'Delete' || event.key === 'Backspace'
        || ((event.metaKey || event.ctrlKey) && ['c', 'd', 'v', 'x'].includes(event.key.toLowerCase()));
      if (!blocked) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    window.addEventListener('keydown', blockHiddenEditorShortcuts, { capture: true });
    return () => {
      useEditor.getState().setCaptureMode(false);
      unsubscribe();
      window.removeEventListener('keydown', blockHiddenEditorShortcuts, { capture: true });
    };
  }, [interactionMode]);
  return null;
}

function PascalViewSwitch({ renderProfile }) {
  const viewMode = useEditor((state) => state.viewMode);
  const setViewMode = useEditor((state) => state.setViewMode);
  useEffect(() => { setViewMode(renderProfile.defaultView); }, [renderProfile.mode, setViewMode]);
  return (
    <div className="pascal-view-switch" aria-label="户型视图">
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

function useRenderProfile() {
  const read = useCallback(() => resolveRenderProfile({
    width: window.innerWidth,
    coarsePointer: window.matchMedia('(pointer: coarse)').matches,
    deviceMemory: navigator.deviceMemory,
    hidden: document.visibilityState === 'hidden',
  }), []);
  const [profile, setProfile] = useState(read);

  useEffect(() => {
    const pointer = window.matchMedia('(pointer: coarse)');
    const update = () => setProfile(read());
    window.addEventListener('resize', update);
    document.addEventListener('visibilitychange', update);
    pointer.addEventListener?.('change', update);
    return () => {
      window.removeEventListener('resize', update);
      document.removeEventListener('visibilitychange', update);
      pointer.removeEventListener?.('change', update);
    };
  }, [read]);

  return profile;
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
