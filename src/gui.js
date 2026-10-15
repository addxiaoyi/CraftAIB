import {
    applyProcessing,
    downloadBlockGrid,
    downloadNBT, downloadLitematic, getVoxelExportData,
    downloadSchematic,
    stopVoxelization,
    updatePalette,
    updateTargetImage,
    voxelConvert,
} from "./script.js?v=20261013-37";
import { downloadProject, openProjectFile, recordProjectExport, restoreProjectFromStorage, saveProjectToStorage } from "./project-store.js?v=20261013-28";
import { createEngineGrid } from "./exports.js";
import { initI18n, applyLanguage, getModeHint, t } from "./i18n.js?v=20261013-37";
import { addSceneLayer, getSceneLayers, removeSceneLayer, reorderSceneLayer, selectSceneLayer, updateSceneLayer } from "./scene-store.js";
import { initializeWorkspaceUI } from "./workspace-ui.js?v=20261013-37";
import { normalizeWorkspaceId } from "./workspace-registry.js?v=20261013-37";

const DEFAULT_TARGET = "./res/upload.svg";
initI18n();
let activeExportCancel = null;
let activeGenerationCancel = null;
let workspaceMessageTimer = null;
let workspaceUI = null;
const $ = (selector) => document.querySelector(selector);
const on = (selector, event, handler) => $(selector)?.addEventListener(event, handler);

on("#convertButton", "click", voxelConvert);
on("#downloadButton", "click", downloadNBT);
on("#cancel-export", "click", cancelActiveExport);
on("#downloadLitematicButton", "click", () => runEngineExport("litematic"));
on("#downloadAiLitematicButton", "click", exportAiLitematic);
on("#downloadViewerButton", "click", () => runEngineExport("viewer"));
on("#downloadGlbButton", "click", () => runEngineExport("glb"));
on("#downloadSchematicButton", "click", () => runEngineExport("schematic"));
on("#downloadGridButton", "click", exportCurrentGrid);
on("#image-input", "change", imageUpdate);
on("#discretize-checkbox", "change", applyProcessing);
on("#dither-checkbox", "change", updatePalette);
on("#reset-image", "click", resetImage);
on("#reset-image-mini", "click", resetImage);
on("#reset-3d", "click", reset3D);
on("#reset-3d-mini", "click", reset3D);
on("#pixelart-checkbox", "change", updatePixelArtVisibility);
on("#grid-yaw", "input", () => rerenderImportedGrid());
on("#grid-cutaway", "input", () => rerenderImportedGrid());
on("#grid-scale", "input", () => rerenderImportedGrid());
on("#grid-render-mode", "change", () => rerenderImportedGrid());
on("#export-grid-preview", "click", exportGridPreview);
on("#analyze-materials", "click", analyzeImportedMaterials);
on("#lego-default-colors", "click", loadLegoDefaultColors);
on("#lego-export-colors", "click", exportLegoColors);
window.addEventListener("craftaib:grid-restored", (event) => { renderImportedGrid(event.detail); renderImportedMaterials(event.detail); syncProjectionExportAvailability(); });
window.addEventListener("craftaib:litematic-info-restored", (event) => renderLitematicInfo(event.detail));
window.addEventListener("craftaib:litematic-placement-restored", (event) => renderLitematicPlacement(event.detail));
window.addEventListener("craftaib:mode-restored", (event) => setWorkspaceMode(event.detail));
on("#export-materials", "click", exportImportedMaterials);
on("#add-scene-layer", "click", addCurrentOutputAsLayer);
on("#merge-scene-layers", "click", mergeVisibleSceneLayers);
on("#open-unified-viewer", "click", openUnifiedViewer);
on("#close-viewer", "click", closeUnifiedViewer);
window.addEventListener("message", handleViewerMessage);
on("#generate-ai-building", "click", generateBuilding);
window.addEventListener("craftaib:scene-changed", () => { window.craftaibStructurePlan = null; renderSceneLayers(); composeVisibleScene(); syncProjectionExportAvailability(); });
window.addEventListener("craftaib:workspace-activated", syncProjectionExportAvailability);
on("#save-project", "click", () => { downloadProject(); setWorkspaceMessage("Project saved."); });
on("#clear-project-cache", "click", () => { localStorage.removeItem("craftaib.project.v1"); setWorkspaceMessage("Local project cache cleared."); });
on("#autosave-toggle", "change", (event) => { localStorage.setItem("craftaib.autosave", event.currentTarget.checked ? "true" : "false"); if (event.currentTarget.checked) saveProjectToStorage(); setWorkspaceMessage(event.currentTarget.checked ? "Project auto-save enabled." : "Project auto-save disabled."); });
on("#show-diagnostics", "click", () => { const output = $("#diagnostics-output"); if (output) output.textContent = JSON.stringify({ mode: document.body.dataset.mode || "image", layers: getSceneLayers().length, blocks: window.craftaibImportedGrid?.cells?.length || 0, language: localStorage.getItem("craftaib.language") || "auto" }, null, 2); setWorkspaceMessage("Diagnostics ready."); });
on("#open-project", "click", () => $("#project-input")?.click());
on("#open-schematic", "click", () => $("#schematic-input")?.click());
on("#open-litematic", "click", () => $("#litematic-input")?.click());
on("#open-placement", "click", () => $("#placement-input")?.click());
on("#open-grid", "click", () => $("#grid-input")?.click());
on("#open-geojson", "click", () => $("#geojson-input")?.click());
on("#open-ldraw", "click", () => $("#ldraw-input")?.click());
on("#ldraw-input", "change", importLDrawFile);
on("#geojson-input", "change", importGeoJsonFile);
on("#grid-input", "change", importGridFile);
on("#litematic-input", "change", importLitematicFile);
on("#placement-input", "change", importPlacementFile);
on("#schematic-input", "change", importSchematicFile);
on("#project-input", "change", async (event) => { try { await openProjectFile(event.target.files[0]); applyProcessing(); setWorkspaceMessage("Project restored."); } catch (error) { setWorkspaceMessage(error.message, true); } });

for (const slider of document.querySelectorAll("input[type=range]")) {
    slider.addEventListener("input", handleSliderInput);
}

for (const input of document.querySelectorAll(".number-input")) {
    input.addEventListener("change", handleNumberInput);
}

for (const nav of document.querySelectorAll(".nav-item")) {
    nav.addEventListener("click", () => setWorkspaceMode(nav.dataset.mode ?? "image"));
}

function setWorkspaceMode(mode) {
    const active = normalizeWorkspaceId(mode);
    if (!workspaceUI?.activate(active)) return;
    clearWorkspaceMessage();
    applyLanguage();
    document.title = `CraftAIB - ${document.querySelector(`[data-page-title="${active}"]`)?.textContent || "Studio"}`;
}

if (!document.body.dataset.mode) document.body.dataset.mode = "structure";
const autosaveToggle = $("#autosave-toggle");
if (autosaveToggle) autosaveToggle.checked = localStorage.getItem("craftaib.autosave") !== "false";
window.addEventListener("craftaib:palette-ready", () => {
    try {
        workspaceUI = initializeWorkspaceUI({ onModeChange: setWorkspaceMode });
        $("#generate-local-preview")?.addEventListener("click", () => generateBuilding({ forceLocal: true }));
        $("#cancel-building-generation")?.addEventListener("click", cancelBuildingGeneration);
        workspaceUI.referenceInput?.addEventListener("change", (event) => workspaceUI.setReferenceImage(event.currentTarget.files?.[0] ?? null));
        setWorkspaceMode(document.body.dataset.mode);
        getAiServiceStatus().catch(() => { const label = $("#ai-service-status [data-service-status]"); if (label) label.textContent = t("aiServiceUnavailable"); });
        syncProjectionExportAvailability();
    } catch (error) {
        setWorkspaceMessage(`Workspace initialization failed: ${error.message}`, true);
        throw error;
    }
}, { once: true });
const mapArtAction = document.createElement("button");
mapArtAction.id = "generate-map-art";
mapArtAction.type = "button";
mapArtAction.className = "export-button map-art-generate";
mapArtAction.textContent = t("generateMapArt");
mapArtAction.addEventListener("click", runMapArtMode);
document.querySelector(".map-art-controls")?.append(mapArtAction);
window.addEventListener("craftaib:language-changed", () => { mapArtAction.textContent = t("generateMapArt"); });
for (const tool of document.querySelectorAll(".tool-button[aria-label]")) {
    const labelModes = { Select: "image", Voxel: "voxel", Materials: "materials", Settings: "settings", "选择": "image", "体素": "voxel", "材料": "materials", "设置": "settings" };
    tool.dataset.mode ||= labelModes[tool.getAttribute("aria-label") || ""] || "";
    tool.addEventListener("click", () => {
        const mode = tool.dataset.mode;
        if (!mode) return;
        setWorkspaceMode(mode);
    });
}

let gridPanX = 0; let gridPanY = 0; let dragState = null;
const dropZone = $(".hero-canvas");
if (dropZone) {
    dropZone.addEventListener("click", (event) => {
        if (document.body.dataset.mode !== "image") event.preventDefault();
    });
    dropZone.addEventListener("pointerdown", (event) => {
        if (!window.craftaibImportedGrid) return;
        dragState = { x: event.clientX, y: event.clientY, yaw: Number($("#grid-yaw")?.value ?? 45) };
        dropZone.setPointerCapture(event.pointerId);
    });
    dropZone.addEventListener("pointermove", (event) => {
        if (!dragState) return;
        const yaw = (dragState.yaw + (event.clientX - dragState.x) * 0.7 + 360) % 360;
        const yawInput = $("#grid-yaw"); if (yawInput) yawInput.value = String(Math.round(yaw));
        gridPanX = event.clientX - dragState.x; gridPanY = event.clientY - dragState.y;
        rerenderImportedGrid();
    });
    dropZone.addEventListener("pointerup", () => { dragState = null; gridPanX = 0; gridPanY = 0; });
    for (const eventName of ["dragenter", "dragover"]) {
        dropZone.addEventListener(eventName, (event) => {
            event.preventDefault();
            dropZone.classList.add("is-dragging");
        });
    }
    for (const eventName of ["dragleave", "drop"]) {
        dropZone.addEventListener(eventName, (event) => {
            event.preventDefault();
            dropZone.classList.remove("is-dragging");
        });
    }
    dropZone.addEventListener("drop", (event) => {
        if (document.body.dataset.mode !== "image") return;
        const file = [...(event.dataTransfer?.files ?? [])].find((item) => item.type.startsWith("image/"));
        if (!file) return;
        const input = $("#image-input");
        const transfer = new DataTransfer();
        transfer.items.add(file);
        input.files = transfer.files;
        imageUpdate();
    });
}

function exportLegoColors() {
    const value = $("#lego-color-map")?.value?.trim() ?? "{}";
    try { const formatted = JSON.stringify(JSON.parse(value), null, 2); const blob = new Blob([formatted], { type: "application/json" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "craftaib-lego-colors.json"; link.click(); URL.revokeObjectURL(url); setWorkspaceMessage("LEGO mapping exported."); } catch (error) { setWorkspaceMessage(error.message, true); }
}
async function loadLegoDefaultColors() {
    const worker = new Worker("./packages/engine-worker/dist/browser/browser-worker.js", { type: "module" }); const taskId = `lego-colors-${Date.now()}`;
    worker.onmessage = (event) => { const message = event.data; if (message.taskId !== taskId) return; if (message.type === "result") { const textarea = $("#lego-color-map"); if (textarea) textarea.value = JSON.stringify(message.output, null, 2); setWorkspaceMessage("LEGO colors loaded."); worker.terminate(); } if (message.type === "error") { setWorkspaceMessage(message.message, true); worker.terminate(); } };
    worker.onerror = () => { setWorkspaceMessage("LEGO color worker failed.", true); worker.terminate(); };
    worker.postMessage({ id: taskId, type: "lego.colors", input: null });
}
async function importLDrawFile(event) {
    const file = event.target.files?.[0]; if (!file) return;
    try {
        const text = await file.text(); const worker = new Worker("./packages/engine-worker/dist/browser/browser-worker.js", { type: "module" }); const taskId = `ldraw-${Date.now()}`;
        setWorkspaceMessage("Reading LDraw model..."); worker.onmessage = (messageEvent) => { const message = messageEvent.data; if (message.taskId !== taskId) return; if (message.type === "error") { setWorkspaceMessage(message.message, true); worker.terminate(); return; } if (message.type === "result") { addImportedLayer(message.output, "lego", "LDraw model"); setWorkspaceMode("lego"); setWorkspaceMessage("LDraw model imported."); worker.terminate(); } }; worker.onerror = () => { setWorkspaceMessage("LDraw worker failed.", true); worker.terminate(); }; worker.postMessage({ id: taskId, type: "lego.blockgrid", input: { bricks: (await runLDrawParse(text)).bricks }, options: { lduPerBlock: 20, defaultBlock: { id: "minecraft:stone" } } });
    } catch (error) { setWorkspaceMessage(error.message, true); }
}
async function runLDrawParse(text) { return new Promise((resolve, reject) => { const worker = new Worker("./packages/engine-worker/dist/browser/browser-worker.js", { type: "module" }); const taskId = `ldraw-parse-${Date.now()}`; worker.onmessage = (event) => { if (event.data.taskId !== taskId) return; if (event.data.type === "result") { resolve(event.data.output); worker.terminate(); } if (event.data.type === "error") { reject(new Error(event.data.message)); worker.terminate(); } }; worker.onerror = () => { reject(new Error("LDraw parser worker failed.")); worker.terminate(); }; worker.postMessage({ id: taskId, type: "lego.parse", input: text }); }); }
async function importGeoJsonFile(event) {
    const file = event.target.files?.[0]; if (!file) return;
    try {
        const geojson = JSON.parse(await file.text()); const worker = new Worker("./packages/engine-worker/dist/browser/browser-worker.js", { type: "module" }); const taskId = `geojson-${Date.now()}`;
        setWorkspaceMessage("Reading GeoJSON..."); worker.onmessage = (messageEvent) => { const message = messageEvent.data; if (message.taskId !== taskId) return; if (message.type === "error") { setWorkspaceMessage(message.message, true); worker.terminate(); return; } if (message.type === "result") { addImportedLayer(message.output, "geo", "GeoJSON scene"); setWorkspaceMode("geo"); setWorkspaceMessage("GeoJSON imported."); worker.terminate(); } }; worker.onerror = () => { setWorkspaceMessage("GeoJSON worker failed.", true); worker.terminate(); }; worker.postMessage({ id: taskId, type: "geo.geojson", input: geojson, options: { center: { lat: Number($("#geo-center-lat")?.value ?? 0), lng: Number($("#geo-center-lng")?.value ?? 0) }, width: Math.max(1, Number($("#geo-width")?.value ?? 128)), length: Math.max(1, Number($("#geo-length")?.value ?? 128)), ground: { id: $("#geo-ground-block")?.value || "minecraft:grass_block" }, road: { id: $("#geo-road-block")?.value || "minecraft:gray_concrete" }, building: { id: $("#geo-building-block")?.value || "minecraft:stone" }, elevation: String($("#geo-elevation")?.value || "").split(",").map(Number).filter(Number.isFinite), vegetation: $("#geo-vegetation")?.checked ?? false, vegetationBlock: { id: $("#geo-vegetation-block")?.value || "minecraft:oak_leaves" } } });
    } catch (error) { setWorkspaceMessage(error.message, true); }
}
async function importGridFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
        const grid = JSON.parse(await file.text());
        const worker = new Worker("./packages/engine-worker/dist/browser/browser-worker.js", { type: "module" });
        const taskId = `grid-validate-${Date.now()}`;
        worker.onmessage = (messageEvent) => {
            const message = messageEvent.data;
            if (message.taskId !== taskId) return;
            if (message.type === "error") { setWorkspaceMessage(message.message, true); worker.terminate(); return; }
            if (message.type === "result") { addImportedLayer(grid, "user", "Imported grid"); setWorkspaceMode("schematic"); setWorkspaceMessage("Grid imported and validated."); worker.terminate(); }
        };
        worker.onerror = () => { setWorkspaceMessage("Grid validation worker failed.", true); worker.terminate(); };
        worker.postMessage({ id: taskId, type: "grid.validate", input: grid });
    } catch (error) { setWorkspaceMessage(error.message, true); }
}

async function importLitematicFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    setWorkspaceMessage("Reading Litematic metadata and regions...");
    try {
        const [grid, info] = await Promise.all([
            runWorkerTask("litematic.parse", bytes, null),
            runWorkerTask("litematic.inspect", bytes, null),
        ]);
        addImportedLayer(grid, "craftmatic", "Litematic structure");
        renderImportedGrid(grid);
        renderImportedMaterials(grid);
        renderLitematicInfo(info);
        setWorkspaceMode("schematic");
        const size = $("#canvas-size");
        if (size) size.textContent = `${grid.width} x ${grid.height} x ${grid.length} blocks`;
        setWorkspaceMessage(`Litematic imported: ${info.regions.length} regions.`);
    } catch (error) {
        setWorkspaceMessage(error.message, true);
    }
}

async function importPlacementFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
        const placement = await runWorkerTask("litematic.placements.parse", await file.text(), null);
        window.craftaibLitematicPlacement = placement;
        renderLitematicPlacement(placement);
        setWorkspaceMessage(`Placement loaded: ${placement.placements.length} placement(s).`);
        saveProjectToStorage();
    } catch (error) {
        setWorkspaceMessage(error.message, true);
    }
}

function renderLitematicInfo(info) {
    window.craftaibLitematicInfo = info;
    const label = $("#litematic-format-label");
    if (label) label.textContent = `v${info.formatVersion} · ${info.regions.length} regions`;
    const panel = $("#litematic-info");
    if (!panel) return;
    const metadata = info.metadata ?? {};
    const rows = info.regions.map((region) => {
        const materials = Object.entries(region.materials ?? {}).map(([id, count]) => `${id.replace("minecraft:", "")} ×${count}`).join(", ");
        return `<div class="litematic-region"><strong>${escapeHtml(region.name)}</strong><span>${region.position.x}, ${region.position.y}, ${region.position.z} · ${region.dimensions.x} × ${region.dimensions.y} × ${region.dimensions.z}</span><small>${escapeHtml(materials || "air only")}</small></div>`;
    }).join("");
    panel.innerHTML = `<div class="litematic-meta"><strong>${escapeHtml(metadata.name || "Unnamed schematic")}</strong><span>${metadata.totalBlocks ?? 0} blocks · ${metadata.totalVolume ?? 0} volume</span></div><div class="litematic-regions">${rows}</div><div id="litematic-placement" class="litematic-placement"><span>Placement: origin (0, 0, 0) · rotation none · mirror none</span></div>`;
}

function renderLitematicPlacement(document) {
    const panel = $("#litematic-placement");
    if (!panel) return;
    const items = document.placements ?? [];
    panel.innerHTML = items.length ? items.map((placement) => `<span>Placement: ${escapeHtml(placement.name)} · ${placement.position.x}, ${placement.position.y}, ${placement.position.z} · rotation ${escapeHtml(placement.rotation)} · mirror ${escapeHtml(placement.mirror)} · ${placement.enabled ? "enabled" : "disabled"}</span>`).join("") : "<span>Placement: none</span>";
}

async function importSchematicFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const worker = new Worker("./packages/engine-worker/dist/browser/browser-worker.js", { type: "module" });
    const taskId = `parse-${Date.now()}`;
    setWorkspaceMessage("Reading schematic...");
    worker.onmessage = (messageEvent) => {
        const message = messageEvent.data;
        if (message.taskId !== taskId) return;
        if (message.type === "error") { setWorkspaceMessage(message.message, true); worker.terminate(); return; }
        if (message.type === "result") {
            addImportedLayer(message.output, "craftmatic", "Schematic structure");
            renderImportedGrid(message.output);
            renderImportedMaterials(message.output);
            setWorkspaceMode("schematic");
            const size = $("#canvas-size");
            if (size) size.textContent = `${message.output.width} × ${message.output.height} × ${message.output.length} blocks`;
            setWorkspaceMessage("Schematic imported.");
            worker.terminate();
        }
    };
    worker.onerror = () => { setWorkspaceMessage("Schematic import worker failed.", true); worker.terminate(); };
    worker.postMessage({ id: taskId, type: "schematic.parse", input: new Uint8Array(await file.arrayBuffer()) });
}
function renderExportHistory() {
    const panel = $("#export-history"); if (!panel) return;
    try { const project = JSON.parse(localStorage.getItem("craftaib.project.v1") ?? "{}"); const exports = (project.exports ?? []).slice(-6).reverse(); panel.innerHTML = exports.length ? `<div class="eyebrow history-label">EXPORT HISTORY</div>` + exports.map((item) => `<div class="history-row"><span>${item.name}</span><small>${new Date(item.createdAt).toLocaleString()}</small></div>`).join("") : ""; } catch { panel.textContent = ""; }
}
function exportImportedMaterials() {
    const grid = window.craftaibImportedGrid;
    if (!grid) { setWorkspaceMessage("Import a Schematic or Litematic first.", true); return; }
    const counts = new Map();
    for (const cell of grid.cells ?? []) { const id = cell.block?.id ?? "minecraft:air"; if (id !== "minecraft:air") counts.set(id, (counts.get(id) ?? 0) + 1); }
    const rows = ["block,required,available,missing,substitutes"];
    for (const [id, required] of counts) { const input = document.querySelector(`[data-material-id="${CSS.escape(id)}"]`); const available = Math.max(0, Number(input?.value) || 0); rows.push([id, required, available, Math.max(0, required - available), document.querySelector(`[data-substitute-id="${CSS.escape(id)}"]`)?.value ?? ""].map(csvEscape).join(",")); }
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "craftaib-materials.csv"; link.click(); URL.revokeObjectURL(url); setWorkspaceMessage("Materials exported.");
}
function analyzeImportedMaterials() {
    const grid = window.craftaibImportedGrid;
    if (!grid) { setWorkspaceMessage("Import a Schematic or Litematic first.", true); return; }
    const inventory = {};
    const rules = {};
    document.querySelectorAll("[data-material-id]").forEach((input) => { inventory[input.dataset.materialId] = Math.max(0, Number(input.value) || 0); });
    document.querySelectorAll("[data-substitute-id]").forEach((input) => { rules[input.dataset.substituteId] = input.value.split(",").map((id) => id.trim()).filter(Boolean); });
    const worker = new Worker("./packages/engine-worker/dist/browser/browser-worker.js", { type: "module" });
    const taskId = `materials-${Date.now()}`;
    worker.onmessage = (event) => {
        const message = event.data;
        if (message.taskId !== taskId) return;
        if (message.type === "error") { setWorkspaceMessage(message.message, true); worker.terminate(); return; }
        if (message.type === "result") { renderMaterialGaps(message.output); setWorkspaceMessage("Inventory analyzed."); worker.terminate(); }
    };
    worker.onerror = () => { setWorkspaceMessage("Material analysis worker failed.", true); worker.terminate(); };
    worker.postMessage({ id: taskId, type: "materials.analyze", input: grid, options: { inventory, rules } });
}

function renderMaterialGaps(gaps) {
    const panel = $("#imported-materials"); if (!panel) return;
    panel.innerHTML = gaps.map((gap) => `<div class="material-row ${gap.missing ? "is-missing" : "is-ready"}"><span>${escapeHtml(gap.id.replace("minecraft:", ""))}</span><small>${t("required")}: ${gap.required}</small><input data-material-id="${escapeHtml(gap.id)}" type="number" min="0" value="${gap.available}" aria-label="${t("availableCount")} ${escapeHtml(gap.id)}"><input class="substitute-input" data-substitute-id="${escapeHtml(gap.id)}" type="text" placeholder="${t("substituteIds")}" aria-label="${t("substituteIds")} ${escapeHtml(gap.id)}" value="${escapeHtml(gap.substitutes.join(", "))}"><b>${gap.missing ? `-${gap.missing}` : t("ready")}</b></div>`).join("");
    saveProjectToStorage();
}
function addImportedLayer(grid, source = "user", name = "") {
    addSceneLayer(grid, source, name);
    composeVisibleScene();
    renderSceneLayers();
    renderImportedMaterials(grid);
    syncProjectionExportAvailability();
    saveProjectToStorage();
}

function addCurrentOutputAsLayer() {
    const grid = window.craftaibImportedGrid;
    if (!grid?.cells?.length) { setWorkspaceMessage("Create or import a structure first.", true); return; }
    addImportedLayer(grid, "user", `Layer ${getSceneLayers().length + 1}`);
    setWorkspaceMessage("Current output added as a scene layer.");
}

function renderSceneLayers() {
    const panel = $("#scene-layers"); if (!panel) return;
    const layers = getSceneLayers();
    if (!layers.length) { panel.innerHTML = '<p class="empty-state">No layers yet. Import a structure or generate Map Art.</p>'; return; }
    panel.innerHTML = layers.map((layer, index) => '<div class="layer-row ' + (layer.selected ? 'is-selected' : '') + '" data-layer-id="' + escapeHtml(layer.id) + '">' +
        '<label class="layer-visibility"><input type="checkbox" data-layer-visible ' + (layer.visible ? 'checked' : '') + ' aria-label="Show ' + escapeHtml(layer.name) + '"></label>' +
        '<button class="layer-select" type="button" aria-label="Select ' + escapeHtml(layer.name) + '">' + escapeHtml(layer.name) + '</button>' +
        '<input class="layer-name" value="' + escapeHtml(layer.name) + '" aria-label="Layer name">' +
        '<input class="layer-offset" data-axis="x" type="number" value="' + (layer.offset?.x ?? 0) + '" aria-label="X offset">' +
        '<input class="layer-offset" data-axis="y" type="number" value="' + (layer.offset?.y ?? 0) + '" aria-label="Y offset">' +
        '<input class="layer-offset" data-axis="z" type="number" value="' + (layer.offset?.z ?? 0) + '" aria-label="Z offset">' +
        '<input class="layer-color" type="color" value="' + (layer.color || '#5aa6ff') + '" aria-label="Layer color">' +
        '<button class="layer-lock" type="button">' + (layer.locked ? 'Unlock' : 'Lock') + '</button>' +
        '<button class="layer-up" type="button" ' + (index === 0 ? 'disabled' : '') + '>↑</button>' +
        '<button class="layer-down" type="button" ' + (index === layers.length - 1 ? 'disabled' : '') + '>↓</button>' +
        '<button class="layer-remove" type="button">×</button><small>' + (layer.grid.cells?.length ?? 0) + ' blocks</small></div>').join('');
    for (const row of panel.querySelectorAll('[data-layer-id]')) {
        const layerId = row.dataset.layerId;
        row.querySelector('[data-layer-visible]')?.addEventListener('change', (event) => { updateSceneLayer(layerId, { visible: event.target.checked }); saveProjectToStorage(); });
        row.querySelector('.layer-select')?.addEventListener('click', () => { selectSceneLayer(layerId); saveProjectToStorage(); });
        row.querySelector('.layer-name')?.addEventListener('change', (event) => { updateSceneLayer(layerId, { name: event.target.value.trim() || 'Unnamed layer' }); saveProjectToStorage(); });
        row.querySelector('.layer-color')?.addEventListener('change', (event) => { updateSceneLayer(layerId, { color: event.target.value }); saveProjectToStorage(); });
        row.querySelector('.layer-lock')?.addEventListener('click', () => { const layer = getSceneLayers().find((item) => item.id === layerId); updateSceneLayer(layerId, { locked: !layer?.locked }); saveProjectToStorage(); });
        row.querySelectorAll('.layer-offset').forEach((field) => field.addEventListener('change', () => { const layer = getSceneLayers().find((item) => item.id === layerId); updateSceneLayer(layerId, { offset: { ...(layer?.offset ?? {}), [field.dataset.axis]: Number(field.value) || 0 } }); saveProjectToStorage(); }));
        row.querySelector('.layer-up')?.addEventListener('click', () => { reorderSceneLayer(layerId, -1); saveProjectToStorage(); });
        row.querySelector('.layer-down')?.addEventListener('click', () => { reorderSceneLayer(layerId, 1); saveProjectToStorage(); });
        row.querySelector('.layer-remove')?.addEventListener('click', () => { removeSceneLayer(layerId); saveProjectToStorage(); setWorkspaceMessage('Scene layer removed.'); });
    }
}

function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char])); }
function csvEscape(value) { const text = String(value ?? ""); return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; }

function composeVisibleScene() {
    const scene = window.craftaibSceneGraph;
    if (!scene?.grids?.length) { window.craftaibImportedGrid = null; renderSceneLayers(); return; }
    runWorkerTask("scene.to-grid", scene, null).then((grid) => {
        window.craftaibImportedGrid = grid;
        renderImportedMaterials(grid);
        rerenderImportedGrid();
        syncProjectionExportAvailability();
    }).catch((error) => setWorkspaceMessage(error.message, true));
}

function mergeVisibleSceneLayers() {
    if (!window.craftaibSceneGraph?.grids?.length) { setWorkspaceMessage("Add at least one scene layer first.", true); return; }
    composeVisibleScene();
    setWorkspaceMessage("Visible layers merged for preview and export.");
}


async function generateBuilding({ forceLocal = false } = {}) {
    const prompt = $("#ai-building-prompt")?.value?.trim() ?? "";
    const file = workspaceUI?.referenceInput?.files?.[0];
    if (!prompt && !file) { setWorkspaceMessage("Describe the building or add a reference image.", true); return; }
    const button = $("#generate-ai-building");
    if (button) button.disabled = true;
    const localButton = $("#generate-local-preview");
    if (localButton) localButton.hidden = true;
    setGenerationSource(t(forceLocal ? "localPlanning" : "planningBuilding"));
    try {
        const image = file ? await prepareReferenceImage(file) : undefined;
        const constraints = readBuildingConstraints();
        const constraintPrompt = `${constraints.style} ${constraints.type}, ${constraints.floors} floors, ${constraints.width} x ${constraints.length}. ${prompt}`.trim();
        const input = { prompt, seed: Number($("#structure-seed")?.value || 42), constraints, referenceImage: image };
        const status = forceLocal ? null : await getAiServiceStatus();
        const useModel = Boolean(image ? status?.vision : status?.text);
        const planned = await runWorkerTask(useModel ? "ai.structure-plan" : "ai.local-structure-plan", useModel ? input : { ...input, prompt: constraintPrompt }, null);
        renderGeneratedRegionSummary(planned.plan, planned.grid);
        addImportedLayer(planned.grid, "user", prompt.slice(0, 48) || planned.plan.name || "Generated building");
        window.craftaibStructurePlan = planned.plan;
        window.craftaibGenerationSource = planned.source;
        setWorkspaceMode("structure");
        setGenerationSource(t(planned.source === "ai" ? "aiGeneratedSource" : "localGeneratedSource"), false, planned.source);
        setWorkspaceMessage(t(planned.source === "ai" ? "buildingGenerated" : "localGenerated"));
    } catch (error) {
        const cancelled = error.message === "Task cancelled.";
        setGenerationSource(cancelled ? t("generationCancelled") : `${t("generationFailed")} ${error.message}`, !cancelled);
        if (localButton) localButton.hidden = cancelled;
        setWorkspaceMessage(cancelled ? t("generationCancelled") : t("generationFailedRecovery"), !cancelled);
    } finally {
        if (button) button.disabled = false;
    }
}

function renderGeneratedRegionSummary(plan, grid) {
    const regions = plan.regions.map((region) => {
        const materials = {};
        for (const cell of grid.cells) {
            if (cell.x < region.x || cell.x >= region.x + region.width || cell.y < region.y || cell.y >= region.y + region.height || cell.z < region.z || cell.z >= region.z + region.length) continue;
            const id = cell.block?.id ?? "minecraft:air";
            if (id !== "minecraft:air") materials[id] = (materials[id] ?? 0) + 1;
        }
        return { name: region.name, position: { x: region.x, y: region.y, z: region.z }, dimensions: { x: region.width, y: region.height, z: region.length }, materials };
    });
    const blocks = Object.values(regions.reduce((counts, region) => {
        for (const [id, count] of Object.entries(region.materials)) counts[id] = (counts[id] ?? 0) + count;
        return counts;
    }, {}));
    const totalBlocks = blocks.reduce((sum, count) => sum + count, 0);
    renderLitematicInfo({ formatVersion: 6, metadata: { name: plan.name, totalBlocks, totalVolume: grid.width * grid.height * grid.length }, regions });
}

async function prepareReferenceImage(file) {
    const bitmap = await createImageBitmap(file);
    const maxEdge = 512;
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Reference image could not be decoded.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return { width: canvas.width, height: canvas.height, pixels: new Uint8Array(context.getImageData(0, 0, canvas.width, canvas.height).data), dataUrl: canvas.toDataURL("image/jpeg", 0.82), sourceName: file.name };
}

function readBuildingConstraints() {
    return {
        type: $("#structure-type")?.value || "house", style: $("#structure-style")?.value || "fantasy",
        floors: clamp(Number($("#structure-floors")?.value) || 2, 1, 12),
        width: clamp(Number($("#structure-width")?.value) || 24, 8, 128),
        length: clamp(Number($("#structure-length")?.value) || 24, 8, 128),
    };
}

async function getAiServiceStatus() {
    const response = await fetch("/api/ai/status", { cache: "no-store" });
    if (!response.ok) throw new Error("AI service status could not be read.");
    const status = await response.json();
    const label = $("#ai-service-status [data-service-status]");
    if (label) label.textContent = status.vision || status.text ? `${t("aiServiceReady")}: ${[status.textModel, status.visionModel].filter(Boolean).join(" / ")}` : t("aiServiceMissing");
    return status;
}

function setGenerationSource(message, isError = false, sourceKind = null) {
    const sourceNode = $("#ai-generation-source");
    if (!sourceNode) return;
    sourceNode.textContent = message;
    sourceNode.dataset.state = isError ? "error" : "ready";
    if (sourceKind) sourceNode.dataset.source = sourceKind;
    else delete sourceNode.dataset.source;
}

async function generateStructure() {
    const options = {
        type: $("#structure-type")?.value || "house",
        style: $("#structure-style")?.value || "fantasy",
        floors: clamp(Number($("#structure-floors")?.value) || 2, 1, 12),
        width: clamp(Number($("#structure-width")?.value) || 24, 8, 256),
        length: clamp(Number($("#structure-length")?.value) || 24, 8, 256),
        seed: Number($("#structure-seed")?.value) || 42,
    };
    setWorkspaceMessage("Generating Craftmatic structure...");
    try {
        const grid = await runWorkerTask("structure.generate", null, options);
        addImportedLayer(grid, "craftmatic", `${options.type} / ${options.style}`);
        setWorkspaceMode("structure");
        setWorkspaceMessage("Structure generated and added as a scene layer.");
    } catch (error) { setWorkspaceMessage(error.message, true); }
}

let viewerObjectUrl = null;
let viewerWindow = null;
async function openUnifiedViewer() {
    const selected = getSceneLayers().find((layer) => layer.selected && layer.visible) || getSceneLayers().find((layer) => layer.visible);
    const grid = selected?.grid || window.craftaibImportedGrid;
    if (!grid?.cells?.length) { setWorkspaceMessage('Create or import a structure before opening the 3D viewer.', true); return; }
    if (selected?.locked) { setWorkspaceMessage('Unlock the selected scene layer before editing it in Viewer.', true); return; }
    try {
        const litematicInfo = window.craftaibLitematicInfo; const overlay = litematicInfo ? { regions: litematicInfo.regions.map((region) => ({ name: region.name, position: { x: region.position.x - grid.origin.x, y: region.position.y - grid.origin.y, z: region.position.z - grid.origin.z }, size: region.dimensions })), placement: window.craftaibLitematicPlacement?.placements?.[0] ?? null } : {}; const html = await runWorkerTask('viewer.textured-html', grid, overlay);
        if (viewerObjectUrl) URL.revokeObjectURL(viewerObjectUrl);
        viewerObjectUrl = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
        const host = $('#viewer-host'); const frame = $('#viewer-frame');
        if (host && frame) { setWorkspaceMode("viewer"); host.hidden = false; frame.src = viewerObjectUrl; setWorkspaceMessage('3D viewer opened in the workspace.'); return; }
        openViewerFallback(html);
    } catch (error) { setWorkspaceMessage(error.message, true); }
}
function openViewerFallback(html) {
    const popup = window.open('about:blank', 'craftaib-viewer');
    if (!popup) { setWorkspaceMessage('The browser blocked the viewer window. Allow pop-ups and retry.', true); return; }
    viewerWindow = popup; popup.document.title = 'CraftAIB Viewer'; popup.document.body.textContent = 'Preparing viewer...';
    viewerObjectUrl = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' })); popup.location.href = viewerObjectUrl;
    setWorkspaceMessage('3D viewer opened in a new tab.');
}
function closeUnifiedViewer() {
    const host = $('#viewer-host'); const frame = $('#viewer-frame'); if (frame) frame.src = 'about:blank'; if (host) host.hidden = true;
    if (viewerWindow && !viewerWindow.closed) viewerWindow.close(); viewerWindow = null;
    if (viewerObjectUrl) { URL.revokeObjectURL(viewerObjectUrl); viewerObjectUrl = null; }
}
function handleViewerMessage(event) {
    const frame = $('#viewer-frame'); if (frame && event.source !== frame.contentWindow && event.source !== viewerWindow) return;
    const message = event.data;
    if (message?.type === 'craftaib.viewer.ready') { event.source?.postMessage({ type: 'craftaib.viewer.request-state' }, '*'); return; }
    if (message?.type !== 'craftaib.viewer.changed' || !message.grid) return;
    const selected = getSceneLayers().find((layer) => layer.selected && layer.visible);
    if (selected?.locked) { setWorkspaceMessage('The selected scene layer is locked.', true); return; }
    runWorkerTask('grid.validate', message.grid, null).then(() => {
        if (selected) updateSceneLayer(selected.id, { grid: message.grid });
        window.craftaibImportedGrid = message.grid; renderImportedGrid(message.grid); renderImportedMaterials(message.grid); saveProjectToStorage();
        setWorkspaceMessage('Viewer changes synced to the selected scene layer.');
    }).catch((error) => setWorkspaceMessage('Viewer update rejected: ' + error.message, true));
}

function runWorkerTask(type, input, options) {
    return new Promise((resolve, reject) => {
        const worker = new Worker("./packages/engine-worker/dist/browser/browser-worker.js", { type: "module" });
        const taskId = `${type.replaceAll(".", "-")}-${Date.now()}`;
        const cancelButton = type.startsWith("ai.") ? $("#cancel-building-generation") : null;
        if (cancelButton) {
            cancelButton.hidden = false;
            activeGenerationCancel = () => worker.postMessage({ type: "cancel", taskId });
        }
        const finish = () => {
            worker.terminate();
            if (cancelButton) cancelButton.hidden = true;
            if (cancelButton) activeGenerationCancel = null;
        };
        worker.onmessage = (event) => {
            const message = event.data; if (message.taskId !== taskId) return;
            if (message.type === "progress") { setWorkspaceMessage(`${t("planningBuilding")} ${message.stage}`); return; }
            if (message.type === "result") { finish(); resolve(message.output); return; }
            if (message.type === "cancelled") { finish(); reject(new Error("Task cancelled.")); return; }
            if (message.type === "error") { finish(); reject(new Error(message.message)); }
        };
        worker.onerror = () => { finish(); reject(new Error(`${type} worker failed.`)); };
        worker.postMessage({ id: taskId, type, input, options });
    });
}

function cancelBuildingGeneration() {
    activeGenerationCancel?.();
}

function renderImportedMaterials(grid) {
    const panel = $("#imported-materials");
    if (!panel) return;
    const counts = new Map();
    for (const cell of grid.cells ?? []) { const id = cell.block?.id ?? "minecraft:air"; if (id !== "minecraft:air") counts.set(id, (counts.get(id) ?? 0) + 1); }
    panel.innerHTML = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id, count]) => `<div class="material-row"><span>${escapeHtml(id.replace("minecraft:", ""))}</span><small>${t("required")}: ${count}</small><input data-material-id="${escapeHtml(id)}" type="number" min="0" value="0" aria-label="${t("availableCount")} ${escapeHtml(id)}"><input class="substitute-input" data-substitute-id="${escapeHtml(id)}" type="text" placeholder="${t("substituteIds")}" aria-label="${t("substituteIds")} ${escapeHtml(id)}"><b>${t("missingStatus")}</b></div>`).join("");
    const emptyState = $("#materials-empty-state");
    if (emptyState) emptyState.hidden = Boolean(grid?.cells?.length);
}
function exportGridPreview() {
    const canvas = $("#canvas");
    if (!window.craftaibImportedGrid || !canvas) { setWorkspaceMessage("Import a structure before exporting its preview.", true); return; }
    canvas.toBlob((blob) => { if (!blob) return; const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `craftaib-${$("#grid-render-mode")?.value ?? "preview"}.png`; link.click(); URL.revokeObjectURL(url); setWorkspaceMessage("Preview PNG exported."); recordProjectExport("png", link.download); }, "image/png");
}
function offsetGrid(grid) { return grid; }
function rerenderImportedGrid() {
    if (window.craftaibImportedGrid) renderImportedGrid(offsetGrid(window.craftaibImportedGrid));
}
function requestCoreRender(grid, mode) {
    const worker = new Worker("./packages/engine-worker/dist/browser/browser-worker.js", { type: "module" });
    const taskId = `render-${mode}-${Date.now()}`;
    worker.onmessage = (event) => {
        const message = event.data; if (message.taskId !== taskId) return;
        if (message.type === "error") { setWorkspaceMessage(message.message, true); worker.terminate(); return; }
        if (message.type !== "result") return;
        const image = message.output; const canvas = $("#canvas"); const context = canvas?.getContext("2d"); if (!canvas || !context) return;
        canvas.width = image.width; canvas.height = image.height; context.putImageData(new ImageData(new Uint8ClampedArray(image.pixels), image.width, image.height), 0, 0); canvas.style.display = "block"; $("#glcanvas").style.display = "none"; worker.terminate();
    };
    worker.onerror = () => { setWorkspaceMessage("Render worker failed.", true); worker.terminate(); };
    worker.postMessage({ id: taskId, type: `render.${mode}`, input: grid, options: { width: 900, height: 560, cutaway: Number($("#grid-cutaway")?.value ?? 100) / 100, scale: Number($("#grid-scale")?.value ?? 100) / 100 * 10 } });
}
function renderImportedGrid(grid) {
    const previewPanel = document.querySelector('[data-mode-page="structure"] .builder-preview-panel');
    previewPanel?.classList.toggle("is-empty", !grid?.cells?.length);
    const size = $("#canvas-size");
    if (size && grid?.cells?.length) size.textContent = `${grid.width} \u00d7 ${grid.height} \u00d7 ${grid.length} ${t("blockUnit")}`;
    if ($("#grid-render-mode")?.value === "floor") return renderFloorGrid(grid);
    if ($("#grid-render-mode")?.value === "cutaway") return renderCutawayGrid(grid);
    const canvas = $("#canvas");
    const processing = $("#glcanvas");
    if (!canvas || !grid?.cells?.length) return;
    $(".hero-canvas")?.classList.add("has-output");
    const context = canvas.getContext("2d");
    const tile = Math.max(5, Math.min(22, 520 / Math.max(grid.width + grid.length, 1)));
    canvas.width = 900; canvas.height = 560;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#111a25"; context.fillRect(0, 0, canvas.width, canvas.height);
    const originX = canvas.width / 2 + gridPanX; const originY = 180 + grid.height * tile * 0.35 + gridPanY;
    for (const cell of grid.cells) {
        const sx = originX + (cell.x - cell.z) * tile * 0.72;
        const sy = originY + (cell.x + cell.z) * tile * 0.36 - cell.y * tile * 0.72;
        drawCube(context, sx, sy, tile * 0.72, blockPreviewColor(cell.block?.id ?? "minecraft:stone"));
    }
    canvas.style.display = "block";
    if (processing) processing.style.display = "none";
}
function renderFloorGrid(grid) {
    const canvas = $("#canvas"); if (!canvas) return; const context = canvas.getContext("2d"); const cell = Math.max(3, Math.min(18, 760 / Math.max(grid.width, grid.length))); canvas.width = 900; canvas.height = 560; context.fillStyle = "#111a25"; context.fillRect(0, 0, canvas.width, canvas.height); const offsetX = (canvas.width - grid.width * cell) / 2; const offsetY = (canvas.height - grid.length * cell) / 2; const highest = new Map(); for (const item of grid.cells) { const key = `${item.x}:${item.z}`; if (!highest.has(key) || item.y > highest.get(key).y) highest.set(key, item); } for (const item of highest.values()) { context.fillStyle = blockPreviewColor(item.block?.id ?? "minecraft:stone").top; context.fillRect(offsetX + item.x * cell, offsetY + item.z * cell, Math.ceil(cell), Math.ceil(cell)); } canvas.style.display = "block"; $("#glcanvas").style.display = "none";
}
function renderCutawayGrid(grid) { renderImportedGrid({ ...grid, cells: grid.cells.filter((cell) => cell.y <= Math.max(1, grid.height - 1) * 0.55) }); }
function drawCube(context, x, y, size, color) {
    const half = size / 2; const depth = size * 0.42;
    context.beginPath(); context.moveTo(x, y); context.lineTo(x + half, y + depth * 0.55); context.lineTo(x, y + depth); context.lineTo(x - half, y + depth * 0.55); context.closePath(); context.fillStyle = color.top; context.fill();
    context.beginPath(); context.moveTo(x - half, y + depth * 0.55); context.lineTo(x, y + depth); context.lineTo(x, y + depth + size); context.lineTo(x - half, y + depth * 0.55 + size * 0.5); context.closePath(); context.fillStyle = color.left; context.fill();
    context.beginPath(); context.moveTo(x, y + depth); context.lineTo(x + half, y + depth * 0.55); context.lineTo(x + half, y + depth * 0.55 + size * 0.5); context.lineTo(x, y + depth + size); context.closePath(); context.fillStyle = color.right; context.fill();
}
function blockPreviewColor(id) { let hash = 0; for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0; const hue = hash % 360; return { top: `hsl(${hue} 55% 58%)`, left: `hsl(${hue} 48% 38%)`, right: `hsl(${hue} 50% 46%)` }; }
function parseLegoColorMap() { try { const parsed = JSON.parse($("#lego-color-map")?.value || "{}"); return parsed; } catch { setWorkspaceMessage("LEGO color mapping JSON is invalid.", true); return {}; } }

async function runMapArtMode() {
    const sourceFile = $("#image-input")?.files?.[0];
    if (!sourceFile) { setWorkspaceMessage("Upload a reference image before generating Map Art.", true); return; }
    const data = getVoxelExportData({ silent: true });
    if (!data) { setWorkspaceMessage("Run voxelization first so Map Art can use the selected block palette.", true); return; }
    let pixels;
    try { pixels = await readMapArtPixels(sourceFile, Number($("#map-art-width")?.value ?? 128), Number($("#map-art-height")?.value ?? 128)); }
    catch (error) { setWorkspaceMessage(error.message, true); return; }
    const palette = data.palette.map((entry) => ({ block: { id: `minecraft:${entry[0]}` }, color: { r: entry[1] ?? 0, g: entry[2] ?? 0, b: entry[3] ?? 0 } }));
    const worker = new Worker("./packages/engine-worker/dist/browser/browser-worker.js", { type: "module" }); const taskId = `map-art-${Date.now()}`;
    setWorkspaceMessage("Generating Map Art...");
    worker.onmessage = (event) => { const message = event.data; if (message.taskId !== taskId) return; if (message.type === "error") { setWorkspaceMessage(message.message, true); worker.terminate(); return; } if (message.type === "result") { addImportedLayer(message.output, "cartographer", "Map Art"); setWorkspaceMessage("Map Art generated."); worker.terminate(); } };
    worker.onerror = () => { setWorkspaceMessage("Map Art worker failed.", true); worker.terminate(); };
    worker.postMessage({ id: taskId, type: "map-art.generate", input: pixels, options: { palette, dither: $("#map-art-dither")?.checked ?? true, staircasing: $("#map-art-staircase")?.value ?? "baseline" } });
}
async function readMapArtPixels(file, width, height) {
    const bitmap = await createImageBitmap(file);
    const targetWidth = Math.max(1, Math.min(512, Math.round(width)));
    const targetHeight = Math.max(1, Math.min(512, Math.round(height)));
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) { bitmap.close(); throw new Error("This browser cannot read image pixels for Map Art."); }
    context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    bitmap.close();
    const rgba = context.getImageData(0, 0, targetWidth, targetHeight).data;
    const pixels = new Array(targetWidth * targetHeight);
    for (let index = 0; index < pixels.length; index += 1) {
        const offset = index * 4;
        pixels[index] = { r: rgba[offset], g: rgba[offset + 1], b: rgba[offset + 2], a: rgba[offset + 3] };
    }
    return { width: targetWidth, height: targetHeight, paletteId: "voxelartcraft", pixels };
}
function cancelActiveExport() {
    activeExportCancel?.();
    activeExportCancel = null;
    const button = $("#cancel-export"); if (button) button.hidden = true;
    setWorkspaceMessage("Export cancelled.");
}

async function exportAiLitematic() {
    const plan = window.craftaibStructurePlan;
    if (!plan) { runEngineExport("litematic"); return; }
    setWorkspaceMessage("Exporting the current building regions...");
    try {
        const bytes = await runWorkerTask("ai.export-plan-litematic", plan, null);
        const blob = new Blob([bytes], { type: "application/gzip" });
        downloadBlob(blob, "craftaib-building-regions.litematic");
        setWorkspaceMessage("Current building exported with named regions.");
        recordProjectExport("litematic", "craftaib-building-regions.litematic"); renderExportHistory();
    } catch (error) { setWorkspaceMessage(error.message, true); }
}
function currentGridForExport() {
    const selected = getSceneLayers().find((layer) => layer.selected && layer.visible) || getSceneLayers().find((layer) => layer.visible);
    if (selected?.grid?.cells?.length) return selected.grid;
    return window.craftaibImportedGrid?.cells?.length ? window.craftaibImportedGrid : null;
}

function syncProjectionExportAvailability() {
    const hasGrid = Boolean(currentGridForExport()?.cells?.length);
    for (const id of ["downloadAiLitematicButton", "downloadLitematicButton", "downloadViewerButton", "downloadGlbButton", "downloadSchematicButton", "downloadGridButton"]) {
        const button = document.getElementById(id);
        if (button) button.disabled = !hasGrid;
    }
}

function exportCurrentGrid() {
    const grid = currentGridForExport();
    if (grid) {
        const blob = new Blob([JSON.stringify(grid, null, 2)], { type: "application/json" });
        downloadBlob(blob, "craftaib-block-grid.json");
        setWorkspaceMessage("BlockGrid exported.");
        recordProjectExport("json", "craftaib-block-grid.json");
        renderExportHistory();
        return;
    }
    const data = getVoxelExportData({ silent: true });
    if (!data) { setWorkspaceMessage("Create or import a structure before exporting a BlockGrid.", true); return; }
    downloadBlockGrid();
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
}

function runEngineExport(format) {
    let input = currentGridForExport();
    if (!input) {
        const data = getVoxelExportData({ silent: true });
        if (data) input = createEngineGrid(data.blocks, data.palette, data.materials);
    }
    if (!input) { setWorkspaceMessage("Create or import a structure before exporting.", true); return; }
    const exportFormat = format === "schematic" ? "schem" : format;
    const worker = new Worker("./packages/engine-worker/dist/browser/browser-worker.js", { type: "module" });
    const taskId = `export-${format}-${Date.now()}`;
    activeExportCancel = () => worker.postMessage({ type: "cancel", taskId });
    const cancelButton = $("#cancel-export"); if (cancelButton) cancelButton.hidden = false;
    setWorkspaceMessage(`Exporting ${exportFormat}...`);
    worker.onmessage = (event) => {
        const message = event.data;
        if (message.taskId !== taskId) return;
        if (message.type === "progress") { setWorkspaceMessage(`${exportFormat.toUpperCase()}: ${message.stage}`); return; }
        if (message.type === "cancelled") { setWorkspaceMessage("Export cancelled."); worker.terminate(); if (cancelButton) cancelButton.hidden = true; activeExportCancel = null; return; }
        if (message.type === "error") { setWorkspaceMessage(message.message, true); worker.terminate(); if (cancelButton) cancelButton.hidden = true; activeExportCancel = null; return; }
        if (message.type === "result") {
            const extension = exportFormat === "litematic" ? "litematic" : exportFormat === "viewer" ? "html" : exportFormat === "glb" ? "glb" : "schem";
            const blob = new Blob([message.output], { type: exportFormat === "viewer" ? "text/html;charset=utf-8" : exportFormat === "glb" ? "model/gltf-binary" : "application/gzip" });
            downloadBlob(blob, `craftaib.${extension}`);
            setWorkspaceMessage(`${extension.toUpperCase()} exported.`); recordProjectExport(extension, `craftaib.${extension}`); renderExportHistory(); worker.terminate(); if (cancelButton) cancelButton.hidden = true; activeExportCancel = null;
        }
    };
    worker.onerror = () => { setWorkspaceMessage("Export worker failed.", true); worker.terminate(); if (cancelButton) cancelButton.hidden = true; activeExportCancel = null; };
    worker.postMessage({ id: taskId, type: "export", input, options: { format: exportFormat === "viewer" ? "html" : exportFormat } });
}
function fileToDataUrl(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("Reference image could not be read.")); reader.readAsDataURL(file); }); }
function imageUpdate() {
    stopVoxelization();
    const input = $("#image-input");
    const resolution = clamp(Number($("#resolution-number")?.value) || 512, 128, 2048);
    const source = input?.files?.[0];
    const image = new Image();

    image.onload = () => {
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        const aspect = image.width / image.height;
        canvas.width = aspect >= 1 ? resolution : Math.max(1, Math.round(resolution * aspect));
        canvas.height = aspect >= 1 ? Math.max(1, Math.round(resolution / aspect)) : resolution;
        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        const scaled = new Image();
        scaled.onload = () => {
            updateTargetImage(scaled);
            const size = $("#canvas-size");
            if (size) size.textContent = `${canvas.width} × ${canvas.height} px`;
            const thumb = $(".asset-thumb img");
            if (thumb) thumb.src = canvas.toDataURL("image/png");
            dropZone?.classList.remove("is-empty"); saveProjectToStorage();
        };
        scaled.src = canvas.toDataURL("image/png");
    };

    image.onerror = () => setWorkspaceMessage("Image could not be loaded. Please choose a PNG, JPG, or WebP file.", true);
    image.src = source ? URL.createObjectURL(source) : DEFAULT_TARGET;
}

function handleSliderInput(event) {
    const slider = event.currentTarget;
    const number = $(`#${slider.id.replace("-slider", "-number")}`);
    if (number) number.value = slider.classList.contains("logarithmic") ? Math.floor(2 ** Number(slider.value)) : slider.value;

    if (slider.id === "resolution-slider") imageUpdate();
    if (slider.id === "depth-min" || slider.id === "depth-max") syncDepthRange(slider.id);
    applyProcessing();
}

function handleNumberInput(event) {
    const number = event.currentTarget;
    const slider = $(`#${number.id.replace("-number", "-slider")}`);
    if (!slider) return;

    const min = Number(slider.min || 0);
    const max = Number(slider.max || 100);
    const value = clamp(Number(number.value) || min, min, max);
    number.value = value;
    slider.value = slider.classList.contains("logarithmic") ? Math.log2(value) : value;

    if (slider.id === "resolution-slider") imageUpdate();
    if (slider.id === "depth-min" || slider.id === "depth-max") syncDepthRange(slider.id);
    applyProcessing();
}

function syncDepthRange(changedId) {
    const minSlider = $("#depth-min");
    const maxSlider = $("#depth-max");
    if (!minSlider || !maxSlider) return;

    if (changedId === "depth-min") maxSlider.value = Math.max(Number(maxSlider.value), Number(minSlider.value));
    if (changedId === "depth-max") minSlider.value = Math.min(Number(minSlider.value), Number(maxSlider.value));
    $("#depth-min-number").value = minSlider.value;
    $("#depth-max-number").value = maxSlider.value;
}

function updatePixelArtVisibility() {
    const isPixelArt = $("#pixelart-checkbox")?.checked;
    document.querySelectorAll(".pixelart-disabled-settings").forEach((element) => {
        element.style.display = isPixelArt ? "none" : "";
    });
}

function resetImage() {
    resetGroup("#settings-image");
    imageUpdate();
    applyProcessing();
}

function reset3D() {
    resetGroup("#settings-3d");
    
renderExportHistory();
updatePixelArtVisibility();
    applyProcessing();
}

function resetGroup(selector) {
    document.querySelectorAll(`${selector} input`).forEach((input) => {
        if (input.type === "checkbox") input.checked = input.defaultChecked;
        else if (input.defaultValue !== undefined) input.value = input.defaultValue;
    });
}

function setWorkspaceMessage(message, isError = false) {
    const hint = $(".canvas-hint");
    const status = workspaceUI?.statusNodes.get(document.body.dataset.mode);
    clearTimeout(workspaceMessageTimer);
    if (hint) { hint.textContent = message; hint.classList.toggle("is-error", isError); }
    if (status) { status.textContent = message; status.classList.toggle("is-error", isError); }
    if (isError || /^(Reading|Analyzing|Generating|Exporting|AI is planning|Map Art generation)/i.test(message)) return;
    workspaceMessageTimer = setTimeout(() => {
        if (hint?.textContent === message || status?.textContent === message) clearWorkspaceMessage();
    }, 3600);
}

function clearWorkspaceMessage() {
    clearTimeout(workspaceMessageTimer);
    workspaceMessageTimer = null;
    const hint = $(".canvas-hint");
    if (hint) { hint.textContent = getModeHint(); hint.classList.remove("is-error"); }
    const status = workspaceUI?.statusNodes.get(document.body.dataset.mode);
    if (status) { status.textContent = ""; status.classList.remove("is-error"); }
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}


renderExportHistory();
updatePixelArtVisibility();
syncDepthRange("depth-max");
setTimeout(() => { try { restoreProjectFromStorage(); applyProcessing(); } catch (error) { setWorkspaceMessage(`Project restore failed: ${error.message}`, true); } }, 120);

export { imageUpdate, imageUpdate as image_update };


