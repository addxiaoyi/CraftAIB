import type { BlockGrid, BlockState } from '@craftaib/core';
import { validateGrid } from '@craftaib/core';

export type ViewerPaletteEntry = {
  state: BlockState;
  color: [number, number, number];
  texture: string | null;
};

export type ViewerBlock = { x: number; y: number; z: number; paletteIndex: number };

export type ViewerRegionOverlay = { name: string; position: { x: number; y: number; z: number }; size: { x: number; y: number; z: number } };
export type ViewerPlacementOverlay = { name?: string; position?: { x: number; y: number; z: number }; rotation?: string; mirror?: string; enabled?: boolean };
export type ViewerOverlay = { regions?: ViewerRegionOverlay[]; placement?: ViewerPlacementOverlay | null };

export type ViewerData = {
  width: number;
  height: number;
  length: number;
  origin: { x: number; y: number; z: number };
  palette: ViewerPaletteEntry[];
  blocks: ViewerBlock[];
};

type LegacyViewerData = {
  width: number;
  height: number;
  length: number;
  origin?: { x: number; y: number; z: number };
  palette: Array<{ name?: string; state?: BlockState | string; color?: [number, number, number]; texture?: string | null }>;
  blocks: Array<{ x: number; y: number; z: number; p?: number; paletteIndex?: number }>;
};

export async function createTexturedHtmlViewer(grid: BlockGrid, overlay: ViewerOverlay = {}): Promise<string> {
  validateGrid(grid);
  const vendorUrl = new URL('../../../vendor/craftmatic/dist/render/three-scene.js', import.meta.url).href;
  const schemaUrl = new URL('../../../vendor/craftmatic/dist/schem/types.js', import.meta.url).href;
  const load = new Function('url', 'return import(url)') as (url: string) => Promise<any>;
  let viewerData: ViewerData;
  const runtime = globalThis as typeof globalThis & { process?: { versions?: { node?: string } } };
  if (!runtime.process?.versions?.node) {
    viewerData = gridToViewerData(grid);
  } else {
    try {
      const [{ serializeForViewerTextured }, { BlockGrid: VendorGrid }] = await Promise.all([load(vendorUrl), load(schemaUrl)]);
      const source = new VendorGrid(grid.width, grid.height, grid.length);
      for (const cell of grid.cells) source.set(cell.x, cell.y, cell.z, formatState(cell.block));
      viewerData = normalizeViewerData(await serializeForViewerTextured(source) as LegacyViewerData, grid);
    } catch (error) {
      throw error;
    }
  }
  const data = JSON.stringify(viewerData).replace(/</g, '\\u003c');
  return buildViewerHtml(data, overlay);
}

export function gridToViewerData(grid: BlockGrid): ViewerData {
  validateGrid(grid);
  const palette: ViewerPaletteEntry[] = [];
  const paletteMap = new Map<string, number>();
  const blocks: ViewerBlock[] = [];
  for (const cell of grid.cells) {
    const state = normalizeState(cell.block);
    const key = formatState(state);
    let paletteIndex = paletteMap.get(key);
    if (paletteIndex === undefined) {
      paletteIndex = palette.length;
      paletteMap.set(key, paletteIndex);
      palette.push({ state, color: blockColor(state.id), texture: null });
    }
    blocks.push({ x: cell.x, y: cell.y, z: cell.z, paletteIndex });
  }
  return { width: grid.width, height: grid.height, length: grid.length, origin: { ...grid.origin }, palette, blocks };
}

export function viewerDataToGrid(data: ViewerData): BlockGrid {
  const normalized = normalizeViewerData(data);
  const cells = normalized.blocks.map((block) => {
    const entry = normalized.palette[block.paletteIndex];
    if (!entry) throw new Error(`Viewer block references palette index ${block.paletteIndex}.`);
    return { x: block.x, y: block.y, z: block.z, block: normalizeState(entry.state), source: 'user' as const };
  });
  const palette = [{ id: 'minecraft:air' }, ...normalized.palette.map((entry) => normalizeState(entry.state))];
  const deduped = [...new Map(palette.map((state) => [formatState(state), state])).values()];
  return validateGrid({ version: 1, width: normalized.width, height: normalized.height, length: normalized.length, origin: { ...normalized.origin }, coordinateSystem: 'xyz', cells, palette: deduped });
}

function normalizeViewerData(input: LegacyViewerData | ViewerData, fallback?: BlockGrid): ViewerData {
  const raw = input as LegacyViewerData;
  const palette = (raw.palette ?? []).map((entry) => {
    const rawState = entry.state ?? entry.name ?? 'minecraft:stone';
    const state = typeof rawState === 'string' ? parseState(rawState) : normalizeState(rawState);
    return { state, color: entry.color ?? blockColor(state.id), texture: entry.texture ?? null };
  });
  const blocks = (raw.blocks ?? []).map((block) => ({
    x: Number(block.x), y: Number(block.y), z: Number(block.z),
    paletteIndex: Number(block.paletteIndex ?? block.p ?? 0),
  }));
  const data: ViewerData = {
    width: Number(raw.width ?? fallback?.width ?? 1),
    height: Number(raw.height ?? fallback?.height ?? 1),
    length: Number(raw.length ?? fallback?.length ?? 1),
    origin: { ...(raw.origin ?? fallback?.origin ?? { x: 0, y: 0, z: 0 }) }, palette, blocks,
  };
  for (const block of data.blocks) {
    if (!Number.isInteger(block.paletteIndex) || block.paletteIndex < 0 || block.paletteIndex >= data.palette.length) throw new Error(`Viewer block references palette index ${block.paletteIndex}.`);
  }
  return data;
}

function parseState(value: string): BlockState {
  const match = value.trim().match(/^([^[]+)(?:\\[(.*)\\])?$/);
  if (!match) throw new Error(`Invalid block state: ${value}`);
  const properties: Record<string, string> = {};
  for (const part of (match[2] ?? '').split(',')) {
    if (!part) continue;
    const separator = part.indexOf('=');
    if (separator < 1) throw new Error(`Invalid block property: ${part}`);
    properties[part.slice(0, separator).trim()] = part.slice(separator + 1).trim();
  }
  return normalizeState({ id: match[1].trim(), ...(Object.keys(properties).length ? { properties } : {}) });
}

function normalizeState(state: BlockState): BlockState {
  return { id: state.id.includes(':') ? state.id : `minecraft:${state.id}`, ...(state.properties ? { properties: { ...state.properties } } : {}) };
}

function buildViewerHtml(serializedData: string, overlay: ViewerOverlay): string {
  const serializedOverlay = JSON.stringify(overlay).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta charset="utf-8"><title>CraftAIB Textured Viewer</title><script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.172.0/build/three.module.js"}}</script><style>html,body{margin:0;height:100%;overflow:hidden;background:#0d141d;color:#eef3fb;font:13px system-ui}header{height:52px;display:flex;align-items:center;gap:10px;padding:0 14px;border-bottom:1px solid #263346;box-sizing:border-box}#info{margin-right:auto;color:#9aacc2}button,input{background:#1c2838;color:#eef3fb;border:1px solid #3a4d67;border-radius:5px;padding:6px 9px}#view{height:calc(100% - 52px);width:100%}</style></head><body><header><strong>CraftAIB Textured Viewer</strong><span id="info">Loading scene</span><span id="regions"></span><select id="regionSelect"><option value="-1">Select region</option></select><input id="blockId" placeholder="minecraft:block[axis=y]"><button id="replace">Replace</button><button id="delete">Delete</button><button id="undo">Undo</button><button id="redo">Redo</button><button id="regionHide">Hide region</button><button id="regionLock">Lock region</button><button id="regionRotate">Rotate region</button><button id="regionMirror">Mirror region</button><button id="download">Download scene</button><button id="reset">Reset camera</button><label>Cut <input id="cut" type="range" min="0" max="100" value="100"></label></header><div id="view"></div><script type="module">
const data=${serializedData}; const overlay=${serializedOverlay};
const threeBase='https://cdn.jsdelivr.net/npm/three@0.172.0';
const THREE=await import(threeBase+'/build/three.module.js');
const {OrbitControls}=await import(threeBase+'/examples/jsm/controls/OrbitControls.js');
const host=document.querySelector('#view'); const renderer=new THREE.WebGLRenderer({antialias:true}); renderer.setPixelRatio(devicePixelRatio); renderer.setSize(host.clientWidth,host.clientHeight); host.appendChild(renderer.domElement);
const scene=new THREE.Scene(); let regionHelpers=[]; const regionColors=[0x61dafb,0xf6c85f,0xff7f66,0xb08cff,0x7ee787]; scene.background=new THREE.Color(0x0d141d); scene.add(new THREE.HemisphereLight(0xffffff,0x223344,1.8)); const sun=new THREE.DirectionalLight(0xffffff,1.4); sun.position.set(25,40,18); scene.add(sun);
let selectedRegionIndex=-1; const hiddenRegions=new Set(); const lockedRegions=new Set(); const camera=new THREE.PerspectiveCamera(45,host.clientWidth/host.clientHeight,.1,10000); const controls=new OrbitControls(camera,renderer.domElement); const loader=new THREE.TextureLoader(); const geometry=new THREE.BoxGeometry(1,1,1); let meshes=[]; let selectedIndex=-1; const history=[]; const future=[];
const paletteMaterial=(entry)=>{if(entry.texture){const texture=loader.load(entry.texture); texture.magFilter=THREE.NearestFilter; texture.minFilter=THREE.NearestFilter; return new THREE.MeshStandardMaterial({map:texture,roughness:.86});} return new THREE.MeshStandardMaterial({color:new THREE.Color(entry.color[0]/255,entry.color[1]/255,entry.color[2]/255),roughness:.86});};
const stateText=(state)=>{const props=Object.entries(state.properties||{}); return state.id+(props.length?'['+props.map(([key,value])=>key+'='+value).join(',')+']':'');};
const parseState=(value)=>{const match=value.trim().match(/^([^[]+)(?:\\[(.*)\\])?$/); if(!match) throw new Error('Invalid block state'); const properties={}; for(const part of (match[2]||'').split(',')){if(!part)continue; const split=part.indexOf('='); if(split<1)throw new Error('Invalid block property'); properties[part.slice(0,split).trim()]=part.slice(split+1).trim();} return {id:match[1].trim(),...(Object.keys(properties).length?{properties}: {})};};
const clone=(value)=>JSON.parse(JSON.stringify(value));
function renderRegions(){const selector=document.querySelector('#regionSelect'); if(selector&&selector.options.length!==(overlay.regions||[]).length+1){selector.innerHTML='<option value=\"-1\">Select region</option>'+(overlay.regions||[]).map((region,index)=>'<option value=\"'+index+'\">'+region.name+'</option>').join('');} if(selector)selector.value=String(selectedRegionIndex); regionHelpers.forEach((helper)=>scene.remove(helper)); regionHelpers=[]; const regions=overlay.regions||[]; regions.forEach((region,index)=>{const position=region.position||{x:0,y:0,z:0}; const size=region.size||{x:1,y:1,z:1}; const box=new THREE.Box3(new THREE.Vector3(position.x,position.y,position.z),new THREE.Vector3(position.x+size.x,position.y+size.y,position.z+size.z)); const helper=new THREE.Box3Helper(box, index===selectedRegionIndex?0xffffff:regionColors[index%regionColors.length]); helper.userData.regionIndex=index; helper.visible=!hiddenRegions.has(index); scene.add(helper); regionHelpers.push(helper);}); const placement=overlay.placement; const regionLabel=selectedRegionIndex>=0&&regions[selectedRegionIndex]?' · selected '+regions[selectedRegionIndex].name+(lockedRegions.has(selectedRegionIndex)?' (locked)':''):''; const label=placement?'Placement '+(placement.name||'')+' · '+(placement.position?.x??0)+', '+(placement.position?.y??0)+', '+(placement.position?.z??0)+' · '+(placement.rotation||'none')+' · '+(placement.mirror||'none'):''; document.querySelector('#regions').textContent=regions.length?regions.length+' regions'+regionLabel+(label?' · '+label:''):label;}
function renderBlocks(){for(const mesh of meshes)scene.remove(mesh); meshes=[]; data.blocks.forEach((block,index)=>{const mesh=new THREE.Mesh(geometry,paletteMaterial(data.palette[block.paletteIndex])); mesh.position.set(block.x+.5,block.y+.5,block.z+.5); mesh.userData.index=index; mesh.userData.y=block.y; mesh.userData.regionIndex=regionForBlock(block); mesh.visible=!hiddenRegions.has(mesh.userData.regionIndex); scene.add(mesh); meshes.push(mesh);}); selectedIndex=-1; updateInfo();}
function updateInfo(message){document.querySelector('#info').textContent=message||data.blocks.length+' blocks · '+data.palette.length+' materials';}
function snapshot(){return {data:clone(data),regions:clone(overlay.regions||[]),hiddenRegions:[...hiddenRegions],lockedRegions:[...lockedRegions],selectedRegionIndex};}
function restore(next){const restored=next.data||next; data.width=restored.width; data.height=restored.height; data.length=restored.length; data.origin=restored.origin; data.palette=restored.palette; data.blocks=restored.blocks; overlay.regions=next.regions||overlay.regions||[]; hiddenRegions.clear(); for(const index of next.hiddenRegions||[])hiddenRegions.add(index); lockedRegions.clear(); for(const index of next.lockedRegions||[])lockedRegions.add(index); selectedRegionIndex=next.selectedRegionIndex??-1; renderRegions(); renderBlocks(); postChanged();}
function postChanged(){const bridge=window.opener||window.parent; bridge.postMessage({type:'craftaib.viewer.changed',grid:{version:1,width:data.width,height:data.height,length:data.length,origin:data.origin,coordinateSystem:'xyz',palette:[{id:'minecraft:air'},...data.palette.map((entry)=>entry.state)],cells:data.blocks.map((block)=>({x:block.x,y:block.y,z:block.z,block:data.palette[block.paletteIndex].state,source:'user'}))}},'*');}
function pushHistory(){history.push(snapshot()); future.length=0;}
function resetCamera(){camera.position.set(Math.max(data.width,data.length)*1.4,Math.max(data.height,12)*1.2,Math.max(data.width,data.length)*1.4); controls.target.set(data.width/2,data.height/2,data.length/2); controls.update();}
window.__craftaibViewerDebug={getState:()=>({selectedRegionIndex,hiddenRegions:[...hiddenRegions],lockedRegions:[...lockedRegions],regions:clone(overlay.regions||[]),visibleMeshes:meshes.filter((mesh)=>mesh.visible).length,history:history.length,future:future.length})};
document.querySelector('#regionSelect')?.addEventListener('change',(event)=>{selectedRegionIndex=Number(event.target.value); renderRegions(); updateInfo(selectedRegionIndex>=0?'Selected region '+(overlay.regions?.[selectedRegionIndex]?.name||''):'No region selected');});
function regionForBlock(block){const regions=overlay.regions||[]; const index=regions.findIndex((region)=>{const p=region.position||{x:0,y:0,z:0}; const size=region.size||{x:1,y:1,z:1}; return block.x>=p.x&&block.x<p.x+size.x&&block.y>=p.y&&block.y<p.y+size.y&&block.z>=p.z&&block.z<p.z+size.z;}); return index;}
function selectedRegion(){return selectedRegionIndex>=0?(overlay.regions||[])[selectedRegionIndex]:null;}
function regionBlocks(index){const region=(overlay.regions||[])[index]; if(!region)return []; const p=region.position||{x:0,y:0,z:0}; const size=region.size||{x:1,y:1,z:1}; return data.blocks.filter((block)=>block.x>=p.x&&block.x<p.x+size.x&&block.y>=p.y&&block.y<p.y+size.y&&block.z>=p.z&&block.z<p.z+size.z);}
function transformRegion(mode){const index=selectedRegionIndex; const region=selectedRegion(); if(!region||lockedRegions.has(index))return; const size=region.size||{x:1,y:1,z:1}; if((mode==='rotate'&&size.x!==size.z)){updateInfo('Rotate requires a square region');return;} pushHistory(); const p=region.position||{x:0,y:0,z:0}; for(const block of regionBlocks(index)){const lx=block.x-p.x,lz=block.z-p.z; if(mode==='rotate'){block.x=p.x+size.z-1-lz; block.z=p.z+lx;} else if(mode==='mirror'){block.x=p.x+size.x-1-lx;}} if(mode==='rotate'){const old=size.x; region.size={...size,x:size.z,z:old};} renderRegions(); renderBlocks(); postChanged(); updateInfo(mode==='rotate'?'Region rotated':'Region mirrored');}
function toggleRegionHidden(){if(selectedRegionIndex<0)return; if(hiddenRegions.has(selectedRegionIndex))hiddenRegions.delete(selectedRegionIndex);else hiddenRegions.add(selectedRegionIndex); renderRegions(); renderBlocks(); updateInfo(hiddenRegions.has(selectedRegionIndex)?'Region hidden':'Region shown');}
function toggleRegionLocked(){if(selectedRegionIndex<0)return; if(lockedRegions.has(selectedRegionIndex))lockedRegions.delete(selectedRegionIndex);else lockedRegions.add(selectedRegionIndex); renderRegions(); updateInfo(lockedRegions.has(selectedRegionIndex)?'Region locked':'Region unlocked');}
renderer.domElement.addEventListener('pointerdown',(event)=>{const rect=renderer.domElement.getBoundingClientRect(); const pointer=new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1); const raycaster=new THREE.Raycaster(); raycaster.setFromCamera(pointer,camera); const regionHit=raycaster.intersectObjects(regionHelpers).find((item)=>item.object.visible); if(regionHit){selectedRegionIndex=regionHit.object.userData.regionIndex; renderRegions(); updateInfo('Selected region '+(overlay.regions?.[selectedRegionIndex]?.name||'')); return;} const hit=raycaster.intersectObjects(meshes).find((item)=>item.object.visible); if(hit){selectedIndex=hit.object.userData.index; const block=data.blocks[selectedIndex]; document.querySelector('#blockId').value=stateText(data.palette[block.paletteIndex].state); hit.object.material.emissive?.setHex(0x335577); updateInfo(stateText(data.palette[block.paletteIndex].state)+' @ '+block.x+', '+block.y+', '+block.z);}});
document.querySelector('#regionHide').onclick=toggleRegionHidden; document.querySelector('#regionLock').onclick=toggleRegionLocked; document.querySelector('#regionRotate').onclick=()=>transformRegion('rotate'); document.querySelector('#regionMirror').onclick=()=>transformRegion('mirror');
document.querySelector('#replace').onclick=()=>{if(selectedIndex<0)return; let state; try{state=parseState(document.querySelector('#blockId').value);}catch(error){updateInfo(error.message);return;} pushHistory(); let next=data.palette.findIndex((entry)=>stateText(entry.state)===stateText(state)); if(next<0){next=data.palette.length; data.palette.push({state,color:[128,128,128],texture:null});} data.blocks[selectedIndex].paletteIndex=next; renderBlocks(); postChanged(); updateInfo('Replaced '+stateText(state));};
document.querySelector('#delete').onclick=()=>{if(selectedIndex<0)return; pushHistory(); data.blocks.splice(selectedIndex,1); renderBlocks(); postChanged(); updateInfo('Block deleted');};
document.querySelector('#undo').onclick=()=>{const previous=history.pop();if(!previous)return;future.push(snapshot());restore(previous);updateInfo('Undo');};
document.querySelector('#redo').onclick=()=>{const next=future.pop();if(!next)return;history.push(snapshot());restore(next);updateInfo('Redo');};
document.querySelector('#download').onclick=()=>{const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='craftaib-textured-scene.json';link.click();URL.revokeObjectURL(url);};
document.querySelector('#cut').oninput=(event)=>{const limit=data.height*Number(event.target.value)/100; meshes.forEach((mesh)=>{mesh.visible=mesh.userData.y<=limit;});}; document.querySelector('#reset').onclick=resetCamera;
addEventListener('resize',()=>{camera.aspect=host.clientWidth/host.clientHeight;camera.updateProjectionMatrix();renderer.setSize(host.clientWidth,host.clientHeight);}); addEventListener('message',(event)=>{if(event.data?.type==='craftaib.viewer.request-state')postChanged();}); resetCamera(); renderRegions(); renderBlocks(); (window.opener||window.parent).postMessage({type:'craftaib.viewer.ready'},'*'); postChanged(); const tick=()=>{requestAnimationFrame(tick);controls.update();renderer.render(scene,camera);};tick();
</script></body></html>`;
}

function blockColor(id: string): [number, number, number] {
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  const hue = (hash >>> 0) % 360; const saturation = 0.48; const lightness = 0.54;
  const c = (1 - Math.abs(2 * lightness - 1)) * saturation; const x = c * (1 - Math.abs((hue / 60) % 2 - 1)); const m = lightness - c / 2;
  const rgb = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
  return rgb.map((value) => Math.round((value + m) * 255)) as [number, number, number];
}

function formatState(state: BlockState): string { const properties = Object.entries(state.properties ?? {}); return properties.length ? `${state.id}[${properties.map(([key, value]) => `${key}=${value}`).join(',')}]` : state.id; }
