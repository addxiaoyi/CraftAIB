const STORAGE_KEY = 'craftaib.project.v1';

const FIELD_IDS = [
  'brightness-number', 'contrast-number', 'saturation-number', 'temperature-number',
  'resolution-number', 'fov-number', 'yaw-number', 'pitch-number', 'depth-min-number',
  'depth-max-number', 'detail-number', 'discretize-checkbox', 'pixelart-checkbox',
  'enforce-boundary-checkbox', 'dither-checkbox',
];

function readFormState() {
  const controls = {};
  for (const id of FIELD_IDS) {
    const input = document.getElementById(id);
    if (!input) continue;
    controls[id] = input.type === 'checkbox' ? input.checked : input.value;
  }
  return controls;
}

function applyFormState(controls) {
  for (const [id, value] of Object.entries(controls ?? {})) {
    const input = document.getElementById(id);
    if (!input) continue;
    if (input.type === 'checkbox') input.checked = Boolean(value);
    else input.value = String(value);
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function createProjectState() {
  return {
    version: 1,
    name: document.querySelector('.canvas-title strong')?.textContent?.trim() || 'Untitled CraftAIB Project',
    mode: document.querySelector('.nav-item.is-active')?.textContent?.trim() || 'Edit',
    controls: readFormState(),
    savedAt: new Date().toISOString(),
  };
}

function saveProjectToStorage() {
  const project = createProjectState();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
  return project;
}

function restoreProjectFromStorage() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  const project = parseProject(raw);
  applyFormState(project.controls);
  return project;
}

function parseProject(raw) {
  const project = JSON.parse(raw);
  if (project?.version !== 1 || typeof project.controls !== 'object') throw new Error('Invalid CraftAIB project file.');
  return project;
}

function downloadProject() {
  const project = saveProjectToStorage();
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'craftaib-project.json';
  link.click();
  URL.revokeObjectURL(url);
  return project;
}

function openProjectFile(file) {
  return file.text().then((raw) => {
    const project = parseProject(raw);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    applyFormState(project.controls);
    return project;
  });
}

export { downloadProject, openProjectFile, restoreProjectFromStorage, saveProjectToStorage };
