import type { BlockGrid } from '@craftaib/core';

export async function createTexturedHtmlViewer(grid: BlockGrid): Promise<string> {
  const vendorUrl = new URL('../../../vendor/craftmatic/dist/render/three-scene.js', import.meta.url).href;
  const schemaUrl = new URL('../../../vendor/craftmatic/dist/schem/types.js', import.meta.url).href;
  const load = new Function('url', 'return import(url)') as (url: string) => Promise<any>;
  let viewerData: ViewerData;
  try {
    const [{ serializeForViewerTextured }, { BlockGrid: VendorGrid }] = await Promise.all([load(vendorUrl), load(schemaUrl)]);
    const source = new VendorGrid(grid.width, grid.height, grid.length);
    for (const cell of grid.cells) source.set(cell.x, cell.y, cell.z, formatState(cell.block));
    viewerData = await serializeForViewerTextured(source) as ViewerData;
  } catch (error) {
    // Browser workers cannot import Craftmatic's Node texture loader; keep the viewer usable with procedural colors.
    const runtime = globalThis as typeof globalThis & { process?: { versions?: { node?: string } } };
    if (runtime.process?.versions?.node) throw error;
    viewerData = fallbackViewerData(grid);
  }
  const data = JSON.stringify(viewerData).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta charset="utf-8"><title>CraftAIB Textured Viewer</title><style>html,body{margin:0;height:100%;overflow:hidden;background:#0d141d;color:#eef3fb;font:13px system-ui}header{height:52px;display:flex;align-items:center;gap:10px;padding:0 14px;border-bottom:1px solid #263346;box-sizing:border-box}#info{margin-right:auto;color:#9aacc2}button,input{background:#1c2838;color:#eef3fb;border:1px solid #3a4d67;border-radius:5px;padding:6px 9px}#view{height:calc(100% - 52px);width:100%}</style></head><body><header><strong>CraftAIB Textured Viewer</strong><span id="info">${data.length ? 'Embedded textures + procedural fallback' : 'Empty scene'}</span><button id="reset">Reset camera</button><label>Cut <input id="cut" type="range" min="0" max="100" value="100"></label></header><div id="view"></div><script type="module">const data=${data};const THREE=await import('https://cdn.jsdelivr.net/npm/three@0.172.0/build/three.module.js');const {OrbitControls}=await import('https://cdn.jsdelivr.net/npm/three@0.172.0/examples/jsm/controls/OrbitControls.js');const host=document.querySelector('#view');const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(devicePixelRatio);renderer.setSize(host.clientWidth,host.clientHeight);host.appendChild(renderer.domElement);const scene=new THREE.Scene();scene.background=new THREE.Color(0x0d141d);scene.add(new THREE.HemisphereLight(0xffffff,0x223344,1.8));const sun=new THREE.DirectionalLight(0xffffff,1.4);sun.position.set(25,40,18);scene.add(sun);const camera=new THREE.PerspectiveCamera(45,host.clientWidth/host.clientHeight,.1,10000);camera.position.set(Math.max(data.width,data.length)*1.4,Math.max(data.height,12)*1.2,Math.max(data.width,data.length)*1.4);const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(data.width/2,data.height/2,data.length/2);controls.update();const loader=new THREE.TextureLoader();const materials=data.palette.map((entry)=>{if(entry.texture){const texture=loader.load(entry.texture);texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestFilter;return new THREE.MeshStandardMaterial({map:texture,roughness:.86})}return new THREE.MeshStandardMaterial({color:new THREE.Color(entry.color[0]/255,entry.color[1]/255,entry.color[2]/255),roughness:.86})});const geometry=new THREE.BoxGeometry(1,1,1);const meshes=data.blocks.map((block)=>{const mesh=new THREE.Mesh(geometry,materials[block.p]);mesh.position.set(block.x+.5,block.y+.5,block.z+.5);mesh.userData.y=block.y;scene.add(mesh);return mesh});document.querySelector('#cut').oninput=(event)=>{const limit=data.height*Number(event.target.value)/100;for(const mesh of meshes)mesh.visible=mesh.userData.y<=limit};document.querySelector('#reset').onclick=()=>{camera.position.set(Math.max(data.width,data.length)*1.4,Math.max(data.height,12)*1.2,Math.max(data.width,data.length)*1.4);controls.target.set(data.width/2,data.height/2,data.length/2);controls.update()};addEventListener('resize',()=>{camera.aspect=host.clientWidth/host.clientHeight;camera.updateProjectionMatrix();renderer.setSize(host.clientWidth,host.clientHeight)});const tick=()=>{requestAnimationFrame(tick);controls.update();renderer.render(scene,camera)};tick();</script></body></html>`;
}

type ViewerData = { width: number; height: number; length: number; blockCount: number; palette: Array<{ name: string; color: [number, number, number]; texture: string | null }>; blocks: Array<{ x: number; y: number; z: number; p: number }> };

function fallbackViewerData(grid: BlockGrid): ViewerData {
  const palette = [];
  const paletteMap = new Map<string, number>();
  const blocks = [];
  for (const cell of grid.cells) {
    const state = formatState(cell.block);
    let index = paletteMap.get(state);
    if (index === undefined) { index = palette.length; paletteMap.set(state, index); palette.push({ name: state, color: blockColor(state), texture: null }); }
    blocks.push({ x: cell.x, y: cell.y, z: cell.z, p: index });
  }
  return { width: grid.width, height: grid.height, length: grid.length, blockCount: blocks.length, palette, blocks };
}

function blockColor(id: string): [number, number, number] { let hash = 2166136261; for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619); const hue = (hash >>> 0) % 360; const saturation = 0.48; const lightness = 0.54; const c = (1 - Math.abs(2 * lightness - 1)) * saturation; const x = c * (1 - Math.abs((hue / 60) % 2 - 1)); const m = lightness - c / 2; const rgb = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x]; return rgb.map((value) => Math.round((value + m) * 255)) as [number, number, number]; }

function formatState(state: { id: string; properties?: Record<string, string> }) { const properties = Object.entries(state.properties ?? {}); return properties.length ? `${state.id}[${properties.map(([key, value]) => `${key}=${value}`).join(',')}]` : state.id; }
