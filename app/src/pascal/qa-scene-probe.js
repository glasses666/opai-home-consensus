/** Read-only QA snapshot of actual renderer objects. No renderer or scene writes. */
export function readRenderedScene(model,mapping,registry) {
  return {source:'pascal-sceneRegistry',sceneId:model.id,objects:model.objects.map(object=>{
    const pascalId=mapping.canonicalToPascal.object[object.id],root=registry.nodes.get(pascalId);
    if(!root)return {id:object.id,roomId:object.roomId,rendered:false};
    root.updateWorldMatrix?.(true,true);
    const meshes=[];
    root.traverse(mesh=>{
      if(!mesh.isMesh)return;
      const materials=(Array.isArray(mesh.material)?mesh.material:[mesh.material]).filter(Boolean);
      meshes.push({name:mesh.name??'',visible:mesh.visible,matrixWorld:[...mesh.matrixWorld.elements],
        vertices:mesh.geometry?.attributes?.position?.count??0,
        materials:materials.map(m=>({type:m.type,color:m.color?.getHexString?.()??null,opacity:m.opacity,roughness:m.roughness,metalness:m.metalness}))});
    });
    const expected=[object.transform.x/1000,object.transform.y/1000,object.transform.z/1000];
    const position=[...root.matrixWorld.elements].slice(12,15);
    return {id:object.id,name:object.name,roomId:object.roomId,rendered:true,assetSettled:root.userData?.itemModelSettled===true,
      expectedCanonicalPositionM:expected,actualWorldPositionM:position,
      matrixWorld:[...root.matrixWorld.elements],canonicalMaterialId:object.materialId,meshes};
  })};
}
