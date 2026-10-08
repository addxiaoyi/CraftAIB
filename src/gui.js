import {
    applyProcessing,
    downloadBlockGrid,
    downloadNBT, downloadLitematic, getVoxelExportData,
    downloadSchematic,
    stopVoxelization,
    updatePalette,
    updateTargetImage,
    voxelConvert,
} from "./script.js";
import { downloadProject, openProjectFile, recordProjectExport, restoreProjectFromStorage, saveProjectToStorage } from "./project-store.js";
import { createEngineGrid } from "./exports.js";

const DEFAULT_TARGET = "./res/upload.svg";
let activeExportCancel = null;
const $ = (selector) => document.querySelector(selector);
const on = (selector, event, handler) => $(selector)?.addEventListener(event, handler);

on("#convertButton", "click", voxelConvert);
on("#downloadButton", "click", downloadNBT);
on("#cancel-export", "click", cancelActiveExport);
on("#downloadLitematicButton", "click", () => runEngineExport("litematic"));
on("#downloadViewerButton", "click", () => runEngineExport("viewer"));
on("#downloadGlbButton", "click", () => runEngineExport("glb"));
on("#downloadSchematicButton", "click", () => runEngineExport("schematic"));
on("#downloadGridButton", "click", downloadBlockGrid);
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
window.addEventListener("craftaib:grid-restored", (event) => { renderImportedGrid(event.detail); renderImportedMaterials(event.detail); });
window.addEventListener("craftaib:mode-restored", (event) => { const nav = document.querySelector(`[data-mode="${event.detail.toLowerCase().replace(" ", "-")}"]`); nav?.click(); });
on("#export-materials", "click", exportImportedMaterials);
on("#save-project", "click", () => { downloadProject(); setWorkspaceMessage("Project saved."); });
on("#open-project", "click", () => $("#project-input")?.click());
on("#open-schematic", "click", () => $("#schematic-input")?.click());
on("#open-litematic", "click", () => $("#litematic-input")?.click());
on("#open-grid", "click", () => $("#grid-input")?.click());
on("#open-geojson", "click", () => $("#geojson-input")?.click());
on("#open-ldraw", "click", () => $("#ldraw-input")?.click());
on("#ldraw-input", "change", importLDrawFile);
on("#geojson-input", "change", importGeoJsonFile);
on("#grid-input", "change", importGridFile);
on("#litematic-input", "change", importLitematicFile);
on("#schematic-input", "change", importSchematicFile);
on("#project-input", "change", async (event) => { try { await openProjectFile(event.target.files[0]); applyProcessing(); setWorkspaceMessage("Project restored."); } catch (error) { setWorkspaceMessage(error.message, true); } });

for (const slider of document.querySelectorAll("input[type=range]")) {
    slider.addEventListener("input", handleSliderInput);
}

for (const input of document.querySelectorAll(".number-input")) {
    input.addEventListener("change", handleNumberInput);
}

for (const nav of document.querySelectorAll(".nav-item")) {
    nav.addEventListener("click", () => {
        document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("is-active"));
        nav.classList.add("is-active");
        document.body.dataset.mode = nav.dataset.mode ?? "image";
        setWorkspaceMessage(`${nav.textContent.trim()} mode selected.`);
    });
}

let gridPanX = 0; let gridPanY = 0; let dragState = null;
const dropZone = $(".hero-canvas");
if (dropZone) {
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
    const worker = new Worker("./packages/engine-worker/dist/browser-worker.js", { type: "module" }); const taskId = `lego-colors-${Date.now()}`;
    worker.onmessage = (event) => { const message = event.data; if (message.taskId !== taskId) return; if (message.type === "result") { const textarea = $("#lego-color-map"); if (textarea) textarea.value = JSON.stringify(message.output, null, 2); setWorkspaceMessage("LEGO colors loaded."); worker.terminate(); } if (message.type === "error") { setWorkspaceMessage(message.message, true); worker.terminate(); } };
    worker.onerror = () => { setWorkspaceMessage("LEGO color worker failed.", true); worker.terminate(); };
    worker.postMessage({ id: taskId, type: "lego.colors", input: null });
}
async function importLDrawFile(event) {
    const file = event.target.files?.[0]; if (!file) return;
    try {
        const text = await file.text(); const worker = new Worker("./packages/engine-worker/dist/browser-worker.js", { type: "module" }); const taskId = `ldraw-${Date.now()}`;
        setWorkspaceMessage("Reading LDraw model..."); worker.onmessage = (messageEvent) => { const message = messageEvent.data; if (message.taskId !== taskId) return; if (message.type === "error") { setWorkspaceMessage(message.message, true); worker.terminate(); return; } if (message.type === "result") { window.craftaibImportedGrid = message.output; renderImportedMaterials(message.output); renderSceneLayers(message.output); rerenderImportedGrid(); document.body.dataset.mode = "lego"; setWorkspaceMessage("LDraw model imported."); worker.terminate(); } }; worker.onerror = () => { setWorkspaceMessage("LDraw worker failed.", true); worker.terminate(); }; worker.postMessage({ id: taskId, type: "lego.blockgrid", input: { bricks: (await runLDrawParse(text)).bricks }, options: { lduPerBlock: 20, defaultBlock: { id: "minecraft:stone" } } });
    } catch (error) { setWorkspaceMessage(error.message, true); }
}
async function runLDrawParse(text) { return new Promise((resolve, reject) => { const worker = new Worker("./packages/engine-worker/dist/browser-worker.js", { type: "module" }); const taskId = `ldraw-parse-${Date.now()}`; worker.onmessage = (event) => { if (event.data.taskId !== taskId) return; if (event.data.type === "result") { resolve(event.data.output); worker.terminate(); } if (event.data.type === "error") { reject(new Error(event.data.message)); worker.terminate(); } }; worker.onerror = () => { reject(new Error("LDraw parser worker failed.")); worker.terminate(); }; worker.postMessage({ id: taskId, type: "lego.parse", input: text }); }); }
async function importGeoJsonFile(event) {
    const file = event.target.files?.[0]; if (!file) return;
    try {
        const geojson = JSON.parse(await file.text()); const worker = new Worker("./packages/engine-worker/dist/browser-worker.js", { type: "module" }); const taskId = `geojson-${Date.now()}`;
        setWorkspaceMessage("Reading GeoJSON..."); worker.onmessage = (messageEvent) => { const message = messageEvent.data; if (message.taskId !== taskId) return; if (message.type === "error") { setWorkspaceMessage(message.message, true); worker.terminate(); return; } if (message.type === "result") { window.craftaibImportedGrid = message.output; renderImportedMaterials(message.output); renderSceneLayers(message.output); rerenderImportedGrid(); document.body.dataset.mode = "geo"; setWorkspaceMessage("GeoJSON imported."); worker.terminate(); } }; worker.onerror = () => { setWorkspaceMessage("GeoJSON worker failed.", true); worker.terminate(); }; worker.postMessage({ id: taskId, type: "geo.geojson", input: geojson, options: { center: { lat: Number($("#geo-center-lat")?.value ?? 0), lng: Number($("#geo-center-lng")?.value ?? 0) }, width: Math.max(1, Number($("#geo-width")?.value ?? 128)), length: Math.max(1, Number($("#geo-length")?.value ?? 128)), ground: { id: $("#geo-ground-block")?.value || "minecraft:grass_block" }, road: { id: $("#geo-road-block")?.value || "minecraft:gray_concrete" }, building: { id: $("#geo-building-block")?.value || "minecraft:stone" }, elevation: String($("#geo-elevation")?.value || "").split(",").map(Number).filter(Number.isFinite), vegetation: $("#geo-vegetation")?.checked ?? false, vegetationBlock: { id: $("#geo-vegetation-block")?.value || "minecraft:oak_leaves" } } });
    } catch (error) { setWorkspaceMessage(error.message, true); }
}
async function importGridFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
        const grid = JSON.parse(await file.text());
        const worker = new Worker("./packages/engine-worker/dist/browser-worker.js", { type: "module" });
        const taskId = `grid-validate-${Date.now()}`;
        worker.onmessage = (messageEvent) => {
            const message = messageEvent.data;
            if (message.taskId !== taskId) return;
            if (message.type === "error") { setWorkspaceMessage(message.message, true); worker.terminate(); return; }
            if (message.type === "result") { window.craftaibImportedGrid = grid; renderImportedMaterials(grid); rerenderImportedGrid(); setWorkspaceMessage("Grid imported and validated."); worker.terminate(); }
        };
        worker.onerror = () => { setWorkspaceMessage("Grid validation worker failed.", true); worker.terminate(); };
        worker.postMessage({ id: taskId, type: "grid.validate", input: grid });
    } catch (error) { setWorkspaceMessage(error.message, true); }
}async function importLitematicFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const worker = new Worker("./packages/engine-worker/dist/browser-worker.js", { type: "module" });
    const taskId = `litematic-parse-${Date.now()}`;
    setWorkspaceMessage("Reading Litematic...");
    worker.onmessage = (messageEvent) => {
        const message = messageEvent.data;
        if (message.taskId !== taskId) return;
        if (message.type === "error") { setWorkspaceMessage(message.message, true); worker.terminate(); return; }
        if (message.type === "result") {
            window.craftaibImportedGrid = message.output;
            renderImportedMaterials(message.output); renderSceneLayers(message.output); rerenderImportedGrid();
            const size = $("#canvas-size"); if (size) size.textContent = `${message.output.width} × ${message.output.height} × ${message.output.length} blocks`;
            setWorkspaceMessage("Litematic imported."); worker.terminate();
        }
    };
    worker.onerror = () => { setWorkspaceMessage("Litematic import worker failed.", true); worker.terminate(); };
    worker.postMessage({ id: taskId, type: "litematic.parse", input: new Uint8Array(await file.arrayBuffer()) });
}
async function importSchematicFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const worker = new Worker("./packages/engine-worker/dist/browser-worker.js", { type: "module" });
    const taskId = `parse-${Date.now()}`;
    setWorkspaceMessage("Reading schematic...");
    worker.onmessage = (messageEvent) => {
        const message = messageEvent.data;
        if (message.taskId !== taskId) return;
        if (message.type === "error") { setWorkspaceMessage(message.message, true); worker.terminate(); return; }
        if (message.type === "result") {
            window.craftaibImportedGrid = message.output;
            renderImportedGrid(message.output);
            renderImportedMaterials(message.output);
            const size = $("#canvas-size");
            if (size) size.textContent = `${message.output.width} × ${message.output.height} × ${message.output.length} blocks`;
            setWorkspaceMessage("Schematic imported.");
            worker.terminate();
        }
    };
    worker.onerror = () => { setWorkspaceMessage("Schematic import worker failed.", true); worker.terminate(); };
    worker.postMessage({ id: taskId, type: "schematic.parse", input: new Uint8Array(await file.arrayBuffer()) });
}
function csvEscape(value) { const text = String(value ?? ""); return /[",\\n]/.test(text) ? `"${text.replaceAll("\\\"", "\\\"\\\"")}"` : text; }
function renderExportHistory() {
    const panel = $("#export-history"); if (!panel) return;
    try { const project = JSON.parse(localStorage.getItem("craftaib.project.v1") ?? "{}"); const exports = (project.exports ?? []).slice(-6).reverse(); panel.innerHTML = exports.length ? `<div class="eyebrow history-label">EXPORT HISTORY</div>` + exports.map((item) => `<div class="history-row"><span>${item.name}</span><small>${new Date(item.createdAt).toLocaleString()}</small></div>`).join("") : ""; } catch { panel.textContent = ""; }
}
function exportImportedMaterials() {
    const grid = window.craftaibImportedGrid;
    if (!grid) { setWorkspaceMessage("Import a Schematic or Litematic first.", true); return; }
    const counts = new Map();
    for (const cell of grid.cells ?? []) { const id = cell.block?.id ?? "minecraft:air"; counts.set(id, (counts.get(id) ?? 0) + 1); }
    const rows = ["block,required,available,missing,substitutes"];
    for (const [id, required] of counts) { const input = document.querySelector(`[data-material-id="${id}"]`); const available = Math.max(0, Number(input?.value) || 0); rows.push([id, required, available, Math.max(0, required - available), document.querySelector(`[data-substitute-id="${id}"]`)?.value ?? ""].map(csvEscape).join(",")); }
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "craftaib-materials.csv"; link.click(); URL.revokeObjectURL(url); setWorkspaceMessage("Materials exported.");
}
function analyzeImportedMaterials() {
    const grid = window.craftaibImportedGrid;
    if (!grid) { setWorkspaceMessage("Import a Schematic or Litematic first.", true); return; }
    const inventory = {};
    document.querySelectorAll("[data-material-id]").forEach((input) => { inventory[input.dataset.materialId] = Math.max(0, Number(input.value) || 0); });
    const worker = new Worker("./packages/engine-worker/dist/browser-worker.js", { type: "module" });
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
    panel.innerHTML = gaps.slice(0, 12).map((gap) => `<div class="material-row ${gap.missing ? "is-missing" : "is-ready"}"><span>${gap.id.replace("minecraft:", "")}</span><input data-material-id="${gap.id}" type="number" min="0" value="${gap.available}"><small title="direct missing / substitute coverage">${gap.directMissing} / ${gap.substituteCoverage}</small><b>${gap.missing ? `-${gap.missing}` : "ready"}</b></div>`).join("");
}
function renderSceneLayers(grid) {
    const panel = $("#scene-layers"); if (!panel) return;
    panel.innerHTML = `<label class="layer-row"><input type="checkbox" data-layer-visible checked><input class="layer-name" value="${window.craftaibLayerName ?? "Imported structure"}"><input class="layer-offset" data-axis="x" type="number" value="${window.craftaibLayerOffset?.x ?? 0}"><input class="layer-offset" data-axis="y" type="number" value="${window.craftaibLayerOffset?.y ?? 0}"><input class="layer-offset" data-axis="z" type="number" value="${window.craftaibLayerOffset?.z ?? 0}"><small>${grid.cells?.length ?? 0} blocks</small></label>`;
    panel.querySelector("[data-layer-visible]")?.addEventListener("change", (event) => { window.craftaibLayerVisible = event.target.checked; rerenderImportedGrid(); }); panel.querySelectorAll(".layer-offset").forEach((input) => input.addEventListener("change", (event) => { window.craftaibLayerOffset = { ...(window.craftaibLayerOffset ?? { x: 0, y: 0, z: 0 }), [event.target.dataset.axis]: Number(event.target.value) || 0 }; saveProjectToStorage(); rerenderImportedGrid(); }));
}
function renderImportedMaterials(grid) {
    const panel = $("#imported-materials");
    if (!panel) return;
    const counts = new Map();
    for (const cell of grid.cells ?? []) { const id = cell.block?.id ?? "minecraft:air"; counts.set(id, (counts.get(id) ?? 0) + 1); }
    panel.innerHTML = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([id, count]) => `<div class="material-row"><span>${id.replace("minecraft:", "")}</span><b>${count}</b></div>`).join("");
}
function exportGridPreview() {
    const canvas = $("#canvas");
    if (!window.craftaibImportedGrid || !canvas) { setWorkspaceMessage("Import a structure before exporting its preview.", true); return; }
    canvas.toBlob((blob) => { if (!blob) return; const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `craftaib-${$("#grid-render-mode")?.value ?? "preview"}.png`; link.click(); URL.revokeObjectURL(url); setWorkspaceMessage("Preview PNG exported."); recordProjectExport("png", link.download); }, "image/png");
}
function offsetGrid(grid) { const offset = window.craftaibLayerOffset ?? { x: 0, y: 0, z: 0 }; return { ...grid, cells: grid.cells.map((cell) => ({ ...cell, x: cell.x + offset.x, y: cell.y + offset.y, z: cell.z + offset.z })) }; }
function rerenderImportedGrid() {
    if (window.craftaibImportedGrid) renderImportedGrid(offsetGrid(window.craftaibImportedGrid));
}
function requestCoreRender(grid, mode) {
    const worker = new Worker("./packages/engine-worker/dist/browser-worker.js", { type: "module" });
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
    if ($("#grid-render-mode")?.value === "floor") return renderFloorGrid(grid);
    if ($("#grid-render-mode")?.value === "cutaway") return renderCutawayGrid(grid);
    const canvas = $("#canvas");
    const processing = $("#glcanvas");
    if (!canvas || !grid?.cells?.length) return;
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

function runMapArtMode() {
    const sourcePixels = window.craftaibPixelMap; const data = getVoxelExportData();
    if (!sourcePixels || !data) { setWorkspaceMessage("Run voxelization once before generating Map Art.", true); return; }
    const pixels = resizePixelMap(sourcePixels, Number($("#map-art-width")?.value ?? 128), Number($("#map-art-height")?.value ?? 128));
    const palette = data.palette.map((entry) => ({ block: { id: `minecraft:${entry[0]}` }, color: { r: entry[1] ?? 0, g: entry[2] ?? 0, b: entry[3] ?? 0 } }));
    const worker = new Worker("./packages/engine-worker/dist/browser-worker.js", { type: "module" }); const taskId = `map-art-${Date.now()}`;
    setWorkspaceMessage("Generating Map Art...");
    worker.onmessage = (event) => { const message = event.data; if (message.taskId !== taskId) return; if (message.type === "error") { setWorkspaceMessage(message.message, true); worker.terminate(); return; } if (message.type === "result") { window.craftaibImportedGrid = message.output; renderImportedMaterials(message.output); renderSceneLayers(message.output); rerenderImportedGrid(); setWorkspaceMessage("Map Art generated."); worker.terminate(); } };
    worker.onerror = () => { setWorkspaceMessage("Map Art worker failed.", true); worker.terminate(); };
    worker.postMessage({ id: taskId, type: "map-art.generate", input: pixels, options: { palette, dither: $("#map-art-dither")?.checked ?? true, staircasing: $("#map-art-staircase")?.value ?? "baseline" } });
}
function resizePixelMap(source, width, height) {
    const targetWidth = Math.max(1, Math.min(512, Math.round(width))); const targetHeight = Math.max(1, Math.min(512, Math.round(height))); const pixels = [];
    for (let y = 0; y < targetHeight; y += 1) for (let x = 0; x < targetWidth; x += 1) { const sx = Math.min(source.width - 1, Math.floor(x * source.width / targetWidth)); const sy = Math.min(source.height - 1, Math.floor(y * source.height / targetHeight)); pixels.push(source.pixels[sy * source.width + sx]); }
    return { width: targetWidth, height: targetHeight, paletteId: source.paletteId, pixels };
}
function cancelActiveExport() {
    activeExportCancel?.();
    activeExportCancel = null;
    const button = $("#cancel-export"); if (button) button.hidden = true;
    setWorkspaceMessage("Export cancelled.");
}

function runEngineExport(format) {
    const data = getVoxelExportData();
    const input = window.craftaibImportedGrid ?? (data ? createEngineGrid(data.blocks, data.palette, data.materials) : null);
    if (!input) return;
    const worker = new Worker("./packages/engine-worker/dist/browser-worker.js", { type: "module" });
    const taskId = `export-${format}-${Date.now()}`;
    activeExportCancel = () => worker.postMessage({ type: "cancel", taskId });
    const cancelButton = $("#cancel-export"); if (cancelButton) cancelButton.hidden = false;
    setWorkspaceMessage(`Exporting ${format}...`);
    worker.onmessage = (event) => {
        const message = event.data;
        if (message.taskId !== taskId) return;
        if (message.type === "progress") { setWorkspaceMessage(`${format.toUpperCase()}: ${message.stage}`); return; }
        if (message.type === "cancelled") { setWorkspaceMessage("Export cancelled."); worker.terminate(); if (cancelButton) cancelButton.hidden = true; activeExportCancel = null; return; }
        if (message.type === "error") { setWorkspaceMessage(message.message, true); worker.terminate(); if (cancelButton) cancelButton.hidden = true; activeExportCancel = null; return; }
        if (message.type === "result") {
            const extension = format === "litematic" ? "litematic" : format === "viewer" ? "html" : format === "glb" ? "glb" : "schem";
            const blob = new Blob([message.output], { type: format === "viewer" ? "text/html;charset=utf-8" : format === "glb" ? "model/gltf-binary" : "application/gzip" });
            const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `craftaib.${extension}`; link.click(); URL.revokeObjectURL(url);
            setWorkspaceMessage(`${extension.toUpperCase()} exported.`); recordProjectExport(extension, `craftaib.${extension}`); renderExportHistory(); worker.terminate(); if (cancelButton) cancelButton.hidden = true; activeExportCancel = null;
        }
    };
    worker.onerror = () => { setWorkspaceMessage("Export worker failed.", true); worker.terminate(); if (cancelButton) cancelButton.hidden = true; activeExportCancel = null; };
    worker.postMessage({ id: taskId, type: "export", input, options: { format: format === "viewer" ? "html" : format } });
}
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
    if (!hint) return;
    hint.textContent = message;
    hint.classList.toggle("is-error", isError);
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}


renderExportHistory();
updatePixelArtVisibility();
syncDepthRange("depth-max");

export { imageUpdate, imageUpdate as image_update };


















































