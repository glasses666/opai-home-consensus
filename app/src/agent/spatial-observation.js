import { affectedRoomIds } from '../domain/entity-labels.js';
import { dispatchSceneCommand, serializeScene } from '../domain/scene.js';
import { convexPolygonsOverlap, distance, objectCollisionFootprint, pointInPolygon, polygonEdges,
  polygonInsidePolygon, rotatedFootprint, segmentAtOffset, segmentsIntersect } from '../domain/geometry.js';
import { evaluateDesignRules } from '../domain/design-rules.js';
import { wallFaceRooms } from '../domain/wall-finishes.js';
import { assertRequirementConstraints, effectivePermissions } from './requirement-constraints.js';

const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const round = n => Math.round(n * 1000) / 1000;
// A conservative CONCEPT planning keep-out, not a construction/daylight standard.
export const WINDOW_PLANNING_CLEARANCE_MM = 150;
const footprint = object => {
  const polygon = objectCollisionFootprint(object);
  return polygon.length ? polygon : rotatedFootprint(object.transform, object.dimensions);
};
const pointSegmentDistance = (p, {start, end}) => {
  const x = end.x-start.x, z = end.z-start.z, length2 = x*x+z*z;
  const t = length2 ? Math.max(0, Math.min(1, ((p.x-start.x)*x+(p.z-start.z)*z)/length2)) : 0;
  return distance(p, {x:start.x+t*x, z:start.z+t*z});
};
export function footprintGap(a, b) {
  if (!a.length || !b.length) return null;
  if (convexPolygonsOverlap(a,b)) return 0;
  return Math.round(Math.min(...a.flatMap(p => polygonEdges(b).map(e => pointSegmentDistance(p,e))),
    ...b.flatMap(p => polygonEdges(a).map(e => pointSegmentDistance(p,e)))));
}
export function sceneDigest(scene) {
  let h = 2166136261;
  for (const c of serializeScene(scene)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0).toString(16).padStart(8,'0'); // A label, not a security hash.
}

export function roomOpenings(scene, roomId) {
  const room = scene.rooms.find(item => item.id === roomId);
  if (!room) throw Error(`ROOM_NOT_FOUND:${roomId}`);
  return scene.openings.flatMap(opening => {
    const host = scene.surfaces.find(item => item.id === opening.hostSurfaceId);
    if (!host?.edge) return [];
    const rooms = new Set([host.roomId, ...Object.values(wallFaceRooms(scene,host)), ...(opening.connectsRoomIds??[])]);
    if (!rooms.has(roomId)) return [];
    const edge = segmentAtOffset(host.edge,opening.offset,opening.width);
    const center = {x:(edge.start.x+edge.end.x)/2,z:(edge.start.z+edge.end.z)/2};
    const dx=edge.end.x-edge.start.x,dz=edge.end.z-edge.start.z,l=Math.hypot(dx,dz);
    let inward = {x:-dz/l,z:dx/l};
    if (!pointInPolygon({x:center.x+inward.x*10,z:center.z+inward.z*10},room.polygon)) inward={x:-inward.x,z:-inward.z};
    return [{factId:`opening:${opening.id}:${roomId}`,id:opening.id,kind:opening.kind,center,edge,inward,
      widthMm:opening.width,sillHeightMm:opening.sillHeight,heightMm:opening.height,swing:opening.swing??null,
      connectsRoomIds:opening.connectsRoomIds??[],source:'canonical_geometry',
      ...(opening.kind==='window'?{planningClearanceMm:WINDOW_PLANNING_CLEARANCE_MM,clearanceSource:'concept_planning_policy_not_building_code'}:{})}];
  });
}

/** Geometric proxies, explicitly NOT perceptual salience, daylight or certified walkways. */
export function observeRoomLayout(scene, roomId, requirements) {
  const room = scene.rooms.find(item=>item.id===roomId);
  if (!room) throw Error(`ROOM_NOT_FOUND:${roomId}`);
  const objects=scene.objects.filter(item=>item.roomId===roomId),openings=roomOpenings(scene,roomId);
  const entries=openings.filter(item=>item.kind.includes('door'));
  return {
    factId:`room:${roomId}`,roomId,name:room.name,polygon:room.polygon,axes:scene.floorPlan.axes,openings,
    objects:objects.map(object=>({
      factId:`object:${object.id}`,id:object.id,name:object.name,category:object.category,transform:object.transform,
      dimensions:object.dimensions,footprint:footprint(object),materialId:object.materialId,
      permissions:effectivePermissions(scene,requirements,object.id),
      entryViews:entries.map(entry=>{
        const eye={x:entry.center.x+entry.inward.x*50,z:entry.center.z+entry.inward.z*50};
        const dx=object.transform.x-eye.x,dz=object.transform.z-eye.z,len=Math.hypot(dx,dz);
        const angle=len?Math.acos(Math.max(-1,Math.min(1,(dx*entry.inward.x+dz*entry.inward.z)/len)))*180/Math.PI:0;
        const occluders=objects.filter(other=>other.id!==object.id && other.dimensions.height>=1200
          && polygonEdges(footprint(other)).some(edge=>segmentsIntersect({start:eye,end:object.transform},edge))).map(item=>item.id);
        const rayInside=Array.from({length:19},(_,i)=>({x:eye.x+dx*(i+1)/20,z:eye.z+dz*(i+1)/20}))
          .every(p=>pointInPolygon(p,room.polygon));
        return {factId:`entry:${entry.id}:${object.id}`,openingId:entry.id,angleFromInwardNormalDeg:round(angle),
          centerDistanceMm:Math.round(len),tallFootprintOccluders:occluders,straightRayInsideRoom:rayInside};
      }),
    })),
    relations:objects.flatMap((a,i)=>objects.slice(i+1).map(b=>({factId:`pair:${[a.id,b.id].sort().join(':')}`,
      objectIds:[a.id,b.id],centerDeltaMm:{x:b.transform.x-a.transform.x,z:b.transform.z-a.transform.z},
      footprintGapMm:footprintGap(footprint(a),footprint(b)),measurement:'shortest_2d_gap_not_walkway_width'}))),
    surfaces:scene.surfaces.filter(s=>s.roomId===roomId||Object.values(wallFaceRooms(scene,s)).includes(roomId))
      .map(s=>({factId:`surface:${s.id}:${roomId}`,id:s.id,kind:s.kind,roomId,materialId:s.roomMaterialIds?.[roomId]??s.materialId})),
    limitations:['入口角度是二维几何估计，不等于视觉主导性；遮挡估计按高物件投影，不是人眼渲染。',
      '最短家具间距不是通行净宽；未建模的使用空间、采光和住户偏好不能据此断言。'],
  };
}

export function candidateFacts(before, after) {
  const facts=[],roomIds=new Set();
  for (const prior of [...before.objects,...before.surfaces]) {
    const next=[...after.objects,...after.surfaces].find(item=>item.id===prior.id);
    if (equal(prior,next)) continue;
    roomIds.add(prior.roomId);
    if (!next) {facts.push({factId:`removed:${prior.id}`,kind:'removed',entityId:prior.id,name:prior.name});continue;}
    if (prior.transform&&!equal(prior.transform,next.transform)) {
      const rotation=next.transform.rotationY-prior.transform.rotationY;
      facts.push({factId:`pose:${prior.id}`,kind:'pose',entityId:prior.id,name:prior.name,roomId:prior.roomId,
        before:prior.transform,after:next.transform,
        translationMm:Math.round(Math.hypot(next.transform.x-prior.transform.x,next.transform.z-prior.transform.z)),
        displacementRelativeToSize:round(Math.hypot(next.transform.x-prior.transform.x,next.transform.z-prior.transform.z)/Math.max(prior.dimensions.width,prior.dimensions.depth)),
        rotationDeg:round(Math.atan2(Math.sin(rotation),Math.cos(rotation))*180/Math.PI)});
    }
    if (prior.materialId!==next.materialId||!equal(prior.roomMaterialIds,next.roomMaterialIds)) {
      const mat=(scene,id)=>{const m=scene.materials.find(item=>item.id===id);return m?{id:m.id,name:m.name,kind:m.kind,color:m.color}:null;};
      facts.push({factId:`finish:${prior.id}`,kind:'finish',entityId:prior.id,name:prior.name??prior.kind,roomId:prior.roomId,
        before:mat(before,prior.materialId),after:mat(after,next.materialId),
        roomFacesBefore:prior.roomMaterialIds??null,roomFacesAfter:next.roomMaterialIds??null});
      for(const roomId of Object.keys(next.roomMaterialIds??{}))if(prior.roomMaterialIds?.[roomId]!==next.roomMaterialIds[roomId])roomIds.add(roomId);
    }
    if (prior.dimensions&&!equal(prior.dimensions,next.dimensions)) facts.push({factId:`size:${prior.id}`,kind:'size',entityId:prior.id,before:prior.dimensions,after:next.dimensions});
  }
  for(const next of after.objects.filter(item=>!before.objects.some(prior=>prior.id===item.id))){
    roomIds.add(next.roomId);facts.push({factId:`added:${next.id}`,kind:'added',entityId:next.id,name:next.name});
  }
  const changedRoomIds=affectedRoomIds(before,after);
  return {facts,changedRoomIds,rooms:changedRoomIds.map(id=>({before:observeRoomLayout(before,id),after:observeRoomLayout(after,id)})),
    source:'validated_scene_delta',limitations:'Measured changes support review, not proof of screen-space visibility or user satisfaction.'};
}

export function windowObstructions(scene) {
  return scene.rooms.flatMap(room=>roomOpenings(scene,room.id).filter(o=>o.kind==='window').flatMap(opening=>{
    const {start,end}=opening.edge,{x,z}=opening.inward,d=WINDOW_PLANNING_CLEARANCE_MM;
    const band=[start,end,{x:end.x+x*d,z:end.z+z*d},{x:start.x+x*d,z:start.z+z*d}];
    return scene.objects.filter(object=>object.roomId===room.id
      &&object.transform.y+object.dimensions.height>opening.sillHeightMm
      &&object.transform.y<opening.sillHeightMm+opening.heightMm
      &&convexPolygonsOverlap(objectCollisionFootprint(object),band))
      .map(object=>({openingId:opening.id,objectIds:[object.id],kind:'WINDOW_PLANNING_BAND_OCCUPIED',
        clearanceMm:d,source:'concept_planning_policy_not_building_code'}));
  }));
}
export function assertNoNewOpeningObstruction(before, after) {
  const key=check=>`${check.openingId}:${(check.objectIds??[]).join(',')}`;
  const occupied=scene=>[...evaluateDesignRules(scene).checks.filter(c=>c.code==='DOOR_SWING_OCCUPIED'&&c.status!=='passed'),...windowObstructions(scene)];
  const previous=new Set(occupied(before).map(key));
  const movedIds=new Set(after.objects.filter(object=>{
    const old=before.objects.find(o=>o.id===object.id);
    return !old||!equal(old.transform,object.transform)||!equal(old.dimensions,object.dimensions);
  }).map(o=>o.id));
  // A moved object cannot remain in an already occupied opening either. Leaving
  // an unrelated historical obstruction untouched is not silently fixing it.
  const added=occupied(after).filter(check=>!previous.has(key(check))||(check.objectIds??[]).some(id=>movedIds.has(id)));
  if(added.length)throw Error('OPENING_OBSTRUCTION: '+added.map(key).join(';'));
}

function spread(pool, count, vector, origin) {
  const chosen=[],rest=[...pool];
  const d=(a,b)=>vector(a).reduce((sum,v,i)=>sum+(v-vector(b)[i])**2,0);
  if(origin&&rest.length){rest.sort((a,b)=>d(a,origin)-d(b,origin));chosen.push(rest.shift());}
  while(rest.length&&chosen.length<count){
    let best=0,score=-1;
    for(let i=0;i<rest.length;i++){
      const s=chosen.length?Math.min(...chosen.map(c=>d(c,rest[i]))):0;
      if(s>score){score=s;best=i;}
    }
    chosen.push(rest.splice(best,1)[0]);
  }
  return chosen;
}

function layoutSignals(before, after, roomId, command) {
  const movedIds=new Set(command.items.map(item=>item.objectId));
  const beforeRoom=observeRoomLayout(before,roomId),afterRoom=observeRoomLayout(after,roomId);
  const relationChanges=afterRoom.relations.filter(relation=>relation.objectIds.some(id=>movedIds.has(id))).map(relation=>{
    const prior=beforeRoom.relations.find(item=>item.factId===relation.factId);
    return {factId:relation.factId,objectIds:relation.objectIds,beforeGapMm:prior?.footprintGapMm??null,
      afterGapMm:relation.footprintGapMm,gapDeltaMm:prior?.footprintGapMm==null?null:relation.footprintGapMm-prior.footprintGapMm,
      measurement:relation.measurement};
  });
  const movements=command.items.map(item=>{
    const object=before.objects.find(candidate=>candidate.id===item.objectId);
    const translationMm=Math.round(Math.hypot(item.transform.x-object.transform.x,item.transform.z-object.transform.z));
    const rotation=item.transform.rotationY-object.transform.rotationY;
    return {objectId:item.objectId,translationMm,
      displacementRelativeToSize:round(translationMm/Math.max(object.dimensions.width,object.dimensions.depth)),
      rotationDeg:round(Math.abs(Math.atan2(Math.sin(rotation),Math.cos(rotation))*180/Math.PI))};
  });
  const entryAngleChanges=afterRoom.objects.filter(object=>movedIds.has(object.id)).flatMap(object=>object.entryViews.map(view=>{
    const prior=beforeRoom.objects.find(item=>item.id===object.id)?.entryViews.find(item=>item.openingId===view.openingId);
    return {objectId:object.id,openingId:view.openingId,beforeDeg:prior?.angleFromInwardNormalDeg??null,
      afterDeg:view.angleFromInwardNormalDeg,deltaDeg:prior==null?null:round(view.angleFromInwardNormalDeg-prior.angleFromInwardNormalDeg),
      measurement:'2d_entry_angle_proxy_not_visual_salience'};
  }));
  const deltas=relationChanges.map(item=>item.gapDeltaMm).filter(Number.isFinite);
  return {changedObjectCount:movedIds.size,movements,relationChanges,entryAngleChanges,
    minimumChangedPairGapMm:relationChanges.length?Math.min(...relationChanges.map(item=>item.afterGapMm)):null,
    worstGapDeltaMm:deltas.length?Math.min(...deltas):null,
    totalTranslationMm:movements.reduce((sum,item)=>sum+item.translationMm,0),
    maxDisplacementRelativeToSize:Math.max(...movements.map(item=>item.displacementRelativeToSize),0),
    maxRotationDeg:Math.max(...movements.map(item=>item.rotationDeg),0)};
}

function compareLayoutQuality(a,b) {
  // Objective-neutral ordering: first avoid degrading an existing furniture gap,
  // then prefer coordinated and perceptible alternatives. These are comparison
  // signals only; they are not walkway or comfort standards.
  const aKeeps=(a.signals.worstGapDeltaMm??0)>=0,bKeeps=(b.signals.worstGapDeltaMm??0)>=0;
  return Number(bKeeps)-Number(aKeeps)
    || (b.signals.worstGapDeltaMm??0)-(a.signals.worstGapDeltaMm??0)
    || b.signals.changedObjectCount-a.signals.changedObjectCount
    || b.signals.maxDisplacementRelativeToSize-a.signals.maxDisplacementRelativeToSize
    || b.signals.maxRotationDeg-a.signals.maxRotationDeg;
}
function posePool(scene, room, object, selected, permissions) {
  const rotations=permissions.canRotate?[object.transform.rotationY,0,Math.PI/2,Math.PI,-Math.PI/2]:[object.transform.rotationY];
  const fixed=scene.objects.filter(other=>other.roomId===room.id&&!selected.has(other.id));
  const pool=[],seen=new Set();
  for(const rotationY of new Set(rotations)){
    const shape=footprint({...object,transform:{...object.transform,x:0,z:0,rotationY}});
    const coords=(axis)=>{
      const half=Math.max(...shape.map(p=>Math.abs(p[axis]))),values=room.polygon.map(p=>p[axis]);
      const min=Math.min(...values),max=Math.max(...values);
      return [...new Set([object.transform[axis],...values.flatMap(v=>[v-half-50,v+half+50]),
        ...[0.25,0.5,0.75].map(t=>min+(max-min)*t)].map(Math.round))].sort((a,b)=>a-b);
    };
    for(const x of coords('x'))for(const z of coords('z')){
      const transform={...object.transform,x,z,rotationY},sig=JSON.stringify(transform);
      if(seen.has(sig))continue;seen.add(sig);
      const moved=footprint({...object,transform});
      if(!polygonInsidePolygon(moved,room.polygon)||fixed.some(other=>convexPolygonsOverlap(moved,objectCollisionFootprint(other))))continue;
      pool.push({objectId:object.id,transform});
    }
  }
  return spread(pool,16,item=>[item.transform.x,item.transform.z,item.transform.rotationY*400],{transform:object.transform});
}

/** Bounded geometric sampling, NOT a room or style preset. No design is auto-selected. */
export function exploreLayout(store,{roomId,objectIds},{requirements,layoutOptions}={}) {
  if(!(layoutOptions instanceof Map))throw Error('LAYOUT_CONTEXT_REQUIRED');
  const scene=store.currentScene,room=scene.rooms.find(r=>r.id===roomId);
  if(!room)throw Error(`ROOM_NOT_FOUND:${roomId}`);
  if(!Array.isArray(objectIds)||!objectIds.length||objectIds.length>2||new Set(objectIds).size!==objectIds.length)throw Error('LAYOUT_SCOPE_INVALID');
  const pools=objectIds.map(id=>{
    const object=scene.objects.find(o=>o.id===id&&o.roomId===roomId);
    if(!object)throw Error(`LAYOUT_SCOPE_UNKNOWN:${id}`);
    const permissions=effectivePermissions(scene,requirements,id);
    if(!permissions.canMove)throw Error(`LAYOUT_TRANSFORM_LOCKED:${id}`);
    return posePool(scene,room,object,new Set(objectIds),permissions);
  });
  const groups=pools.flatMap(pool=>pool.map(pose=>[pose]));
  if(pools.length===2)for(const a of pools[0])for(const b of pools[1])groups.push([a,b]);
  const legal=[],seen=new Set(),failures={};let tested=0;
  for(const group of groups.slice(0,320)){
    const items=group.filter(item=>!equal(item.transform,scene.objects.find(o=>o.id===item.objectId).transform));
    if(!items.length)continue;
    const sig=JSON.stringify(items);if(seen.has(sig))continue;seen.add(sig);tested++;
    try{
      const command={type:'objects.setTransforms',items};
      const next=dispatchSceneCommand(store,command);
      assertRequirementConstraints(scene,next.currentScene,requirements);
      assertNoNewOpeningObstruction(scene,next.currentScene);
      legal.push({command,scene:next.currentScene});
    }catch(error){const code=error.message.match(/^[A-Z][A-Z_]+/)?.[0]??'GEOMETRY_REJECTED';failures[code]=(failures[code]??0)+1;}
  }
  const ranked=legal.map(option=>({...option,signals:layoutSignals(scene,option.scene,roomId,option.command)})).sort(compareLayoutQuality);
  const leading=ranked.slice(0,4),leadingCommands=new Set(leading.map(option=>JSON.stringify(option.command)));
  const remaining=ranked.filter(option=>!leadingCommands.has(JSON.stringify(option.command)));
  const vector=option=>objectIds.flatMap(id=>{const t=option.scene.objects.find(o=>o.id===id).transform;return[t.x,t.z,t.rotationY*400];});
  const selected=[...leading,...spread(remaining,Math.max(0,8-leading.length),vector)];
  const base=serializeScene(scene),digest=sceneDigest(scene);
  const options=selected.map(({command,scene:after,signals},i)=>{
    const id=`layout-${digest}-${objectIds.join('_')}-${i}`;
    layoutOptions.set(id,{base,command});while(layoutOptions.size>64)layoutOptions.delete(layoutOptions.keys().next().value);
    const roomAfter=observeRoomLayout(after,roomId,requirements);
    const changedIds=new Set(command.items.map(item=>item.objectId));
    return {id,baseSceneDigest:digest,items:command.items,effects:candidateFacts(scene,after).facts,qualitySignals:signals,
      roomAfter:{relations:roomAfter.relations.filter(relation=>relation.objectIds.some(id=>changedIds.has(id))),
        entryViews:roomAfter.objects.filter(object=>changedIds.has(object.id)).map(({id,entryViews})=>({id,entryViews}))},
      ruleStatus:evaluateDesignRules(after).status};
  });
  return {roomId,objectIds,options,search:{tested,legal:legal.length,returned:options.length,failures,exhaustive:false},
    instruction:'按用户目标比较 qualitySignals 后选择已观察到的 optionId，用 apply_layout_option 原子应用，不抄写或猜坐标。优先避免无理由缩小既有家具间距；变化幅度、入口角度和最短间距都只是几何比较信号，不是舒适度、视觉效果或通行规范证明。没有选项只表示本次有界搜索未找到，不证明不存在合法布局。'};
}
export function applyLayoutOption(store,optionId,{requirements,layoutOptions}={}) {
  const option=layoutOptions?.get(optionId);
  if(!option)throw Error('LAYOUT_OPTION_NOT_OBSERVED');
  // Full canonical bytes, not the small label hash, guard against stale options.
  if(option.base!==serializeScene(store.currentScene))throw Error('LAYOUT_OPTION_STALE');
  const next=dispatchSceneCommand(store,option.command);
  assertRequirementConstraints(store.currentScene,next.currentScene,requirements);
  assertNoNewOpeningObstruction(store.currentScene,next.currentScene);
  return {store:next,result:{optionId,command:option.command,sceneDigest:sceneDigest(next.currentScene)}};
}
