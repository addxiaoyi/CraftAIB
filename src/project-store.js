import { restoreSceneLayers, sceneToProjectState, setSceneLayers } from './scene-store.js';

const STORAGE_KEY = 'craftaib.project.v1';
const FIELD_IDS = ['brightness-number', 'contrast-number', 'saturation-number', 'temperature-number', 'resolution-number', 'fov-number', 'yaw-number', 'pitch-number', 'depth-min-number', 'depth-max-number', 'detail-number', 'discretize-checkbox', 'pixelart-checkbox', 'enforce-boundary-checkbox', 'dither-checkbox', 'grid-render-mode', 'grid-yaw', 'grid-cutaway', 'grid-scale', 'map-art-dither', 'map-art-staircase', 'map-art-width', 'map-art-height', 'lego-color-map', 'geo-center-lat', 'geo-center-lng', 'geo-width', 'geo-length', 'geo-ground-block', 'geo-road-block', 'geo-building-block', 'geo-elevation', 'geo-vegetation', 'geo-vegetation-block', 'structure-type', 'structure-style', 'structure-floors', 'structure-width', 'structure-length', 'structure-seed'];

function readFormState() {
  const controls = {};
  for (const id of FIELD_IDS) { const input = document.getElementById(id); if (input) controls[id] = input.type === 'checkbox' ? input.checked : input.value; }
  return controls;
}
function applyFormState(controls) {
  for (const [id, value] of Object.entries(controls ?? {})) { const input = document.getElementById(id); if (!input) continue; if (input.type === 'checkbox') input.checked = Boolean(value); else input.value = String(value); }
}
function readMaterialState() {
  const inventory = {}; const rules = {};
  document.querySelectorAll('[data-material-id]').forEach((input) => { inventory[input.dataset.materialId] = Math.max(0, Number(input.value) || 0); const rule = document.querySelector(`[data-substitute-id="${input.dataset.materialId}"]`); rules[input.dataset.materialId] = (rule?.value ?? '').split(',').map((id) => id.trim()).filter(Boolean); });
  return { inventory, rules };
}
function restoreMaterialState(inventory = {}, rules = {}) {
  for (const input of document.querySelectorAll('[data-material-id]')) { input.value = String(inventory[input.dataset.materialId] ?? 0); const rule = document.querySelector(`[data-substitute-id="${input.dataset.materialId}"]`); if (rule) rule.value = (rules[input.dataset.materialId] ?? []).join(','); }
}
function createProjectState() { const materials = readMaterialState(); return { version: 2, name: document.querySelector('.canvas-title strong')?.textContent?.trim() || 'Untitled CraftAIB Project', mode: document.querySelector('.nav-item.is-active')?.textContent?.trim() || 'Edit', controls: readFormState(), importedGrid: window.craftaibImportedGrid ?? null, layers: sceneToProjectState(), layerOffset: window.craftaibLayerOffset ?? { x: 0, y: 0, z: 0 }, layerName: window.craftaibLayerName ?? 'Imported structure', materialInventory: materials.inventory, materialRules: materials.rules, savedAt: new Date().toISOString() }; }
function saveProjectToStorage() { const project = createProjectState(); localStorage.setItem(STORAGE_KEY, JSON.stringify(project)); return project; }
function recordProjectExport(format, name) { const project = createProjectState(); const previous = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}'); project.exports = Array.isArray(previous.exports) ? previous.exports : []; project.exports.push({ format, name, createdAt: new Date().toISOString() }); localStorage.setItem(STORAGE_KEY, JSON.stringify(project)); return project; }
function restoreProject(project) { applyFormState(project.controls); const restored = Array.isArray(project.layers) && project.layers.length > 0 ? restoreSceneLayers(project.layers) : false; if (!restored && project.importedGrid) { setSceneLayers([{ id: 'layer-restored', name: project.layerName ?? 'Imported structure', source: 'user', visible: true, offset: project.layerOffset ?? { x: 0, y: 0, z: 0 }, grid: project.importedGrid }]); } if (window.craftaibImportedGrid) window.dispatchEvent(new CustomEvent('craftaib:grid-restored', { detail: window.craftaibImportedGrid })); window.dispatchEvent(new CustomEvent('craftaib:mode-restored', { detail: project.mode })); restoreMaterialState(project.materialInventory, project.materialRules); return project; }
function restoreProjectFromStorage() { const raw = localStorage.getItem(STORAGE_KEY); if (!raw) return null; return restoreProject(parseProject(raw)); }
function parseProject(raw) { const project = JSON.parse(raw); if (![1, 2].includes(project?.version) || typeof project.controls !== 'object') throw new Error('Invalid CraftAIB project file.'); return project; }
function downloadProject() { const project = saveProjectToStorage(); const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'craftaib-project.json'; link.click(); URL.revokeObjectURL(url); return project; }
function openProjectFile(file) { if (!file) return Promise.reject(new Error('Choose a CraftAIB project file.')); return file.text().then((raw) => { const project = parseProject(raw); localStorage.setItem(STORAGE_KEY, JSON.stringify(project)); return restoreProject(project); }); }
export { downloadProject, openProjectFile, recordProjectExport, restoreProjectFromStorage, saveProjectToStorage };











