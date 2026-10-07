import type { BlockGrid } from '@craftaib/core';
import { validateGrid } from '@craftaib/core';

export function createHtmlViewer(grid: BlockGrid): string {
  validateGrid(grid);
  const data = JSON.stringify(grid).replace(/</g, '\\u003c');
  return `<!doctype html>
<meta charset="utf-8"><title>CraftAIB Viewer</title>
<style>html,body{margin:0;height:100%;background:#101722;color:#eef3fb;font:14px system-ui}body{display:grid;grid-template-rows:52px 1fr}header{display:flex;align-items:center;gap:10px;padding:0 16px;border-bottom:1px solid #273347}canvas{width:100%;height:100%;image-rendering:auto;cursor:grab}canvas:active{cursor:grabbing}button,input{background:#202a3a;color:#eef3fb;border:1px solid #35445b;border-radius:6px;padding:7px 10px}input{padding:0;width:120px}</style>
<header><strong>CraftAIB Viewer</strong><button id="floor">Floor</button><button id="iso">Exterior</button><button id="cut">Cutaway</button><label>Cut <input id="cutoff" type="range" min="0" max="100" value="100"></label><label>Zoom <input id="zoom" type="range" min="50" max="200" value="100"></label></header>
<canvas id="view"></canvas>
<script>
const grid=${data};const canvas=document.querySelector('#view'),ctx=canvas.getContext('2d');let mode='iso',yaw=45,zoom=1,cutoff=1,drag=null;
function draw(){const d=devicePixelRatio;canvas.width=innerWidth*d;canvas.height=(innerHeight-52)*d;ctx.setTransform(d,0,0,d,0,0);ctx.fillStyle='#101722';ctx.fillRect(0,0,innerWidth,innerHeight);const scale=Math.max(4,Math.min(18,500/Math.max(grid.width+grid.length,1)))*zoom;const rad=yaw*Math.PI/180;const ox=innerWidth/2,oy=150+grid.height*scale*.35;if(mode==='floor'){for(const c of grid.cells){const x=ox-grid.width*scale/2+c.x*scale,y=(innerHeight-52)/2-grid.length*scale/2+c.z*scale;ctx.fillStyle='#5da5c9';ctx.fillRect(x,y,scale,scale)}}else{for(const c of grid.cells){if(mode==='cut'&&c.y>grid.height*cutoff)continue;const rx=c.x*Math.cos(rad)-c.z*Math.sin(rad),rz=c.x*Math.sin(rad)+c.z*Math.cos(rad),x=ox+(rx-rz)*scale*.7,y=oy+(rx+rz)*scale*.35-c.y*scale*.7;ctx.fillStyle='#63b87b';ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+scale/2,y+scale*.25);ctx.lineTo(x,y+scale*.5);ctx.lineTo(x-scale/2,y+scale*.25);ctx.fill()}}}
document.querySelector('#floor').onclick=()=>{mode='floor';draw()};document.querySelector('#iso').onclick=()=>{mode='iso';draw()};document.querySelector('#cut').onclick=()=>{mode='cut';draw()};document.querySelector('#cutoff').oninput=e=>{cutoff=Number(e.target.value)/100;draw()};document.querySelector('#zoom').oninput=e=>{zoom=Number(e.target.value)/100;draw()};canvas.onpointerdown=e=>{drag={x:e.clientX,y:e.clientY,yaw};canvas.setPointerCapture(e.pointerId)};canvas.onpointermove=e=>{if(!drag)return;yaw=(drag.yaw+(e.clientX-drag.x)*.7+360)%360;draw()};canvas.onpointerup=()=>drag=null;addEventListener('resize',draw);draw();
</script>`;
}
