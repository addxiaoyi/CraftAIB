import { WORKSPACE_GROUPS, WORKSPACES, normalizeWorkspaceId } from "./workspace-registry.js?v=20261013-37";
import { getModeHint, getModeTitle, t } from "./i18n.js?v=20261013-37";

function initializeWorkspaceUI({ onModeChange }) {
    const root = document.querySelector(".workspace");
    const oldNav = document.querySelector(".topnav");
    const oldEditor = document.querySelector(".editor-column");
    const oldInspector = document.querySelector(".inspector");
    const oldRail = document.querySelector(".toolrail");
    if (!root || !oldNav || !oldEditor || !oldInspector || !oldRail) throw new Error("Workspace bootstrap requires the existing editor shell.");

    const controls = collectWorkspaceControls(oldInspector);
    const canvasStage = oldEditor.querySelector(".canvas-stage");
    const timeline = oldEditor.querySelector(".timeline-panel");
    const viewerHost = oldEditor.querySelector("#viewer-host");
    const exportActions = timeline?.querySelector(".timeline-actions");
    const compatibilityControls = controls.compatibilityControls;
    const imageThumb = oldRail.querySelector(".asset-thumb");
    const navButtons = [...oldNav.querySelectorAll(".nav-item")];
    const pages = new Map();
    const pageRoot = document.createElement("div");
    pageRoot.className = "workspace-pages";
    pageRoot.id = "workspace-pages";

    const sidebar = createSidebar(navButtons, onModeChange);
    if (compatibilityControls) {
        compatibilityControls.hidden = true;
        document.body.append(compatibilityControls);
    }
    for (const definition of WORKSPACES) {
        const page = createPage(definition, navButtons.find((item) => item.dataset.mode === definition.id));
        pages.set(definition.id, page);
        pageRoot.append(page.element);
    }

    root.replaceChildren(sidebar.element, pageRoot);
    controls.imageControls && pages.get("image").controls.append(controls.imageControls);
    controls.palette && pages.get("image").context.append(controls.palette);
    controls.mapArtControls && pages.get("map-art").controls.append(controls.mapArtControls);
    controls.voxelControls && pages.get("voxel").controls.append(controls.voxelControls);
    controls.structureControls && pages.get("structure").controls.append(controls.structureControls);
    controls.geoControls && pages.get("geo").controls.append(controls.geoControls);
    controls.legoControls && pages.get("lego").controls.append(controls.legoControls);
    controls.projectControls && pages.get("settings").controls.append(controls.projectControls);
    controls.aiServiceStatus && pages.get("settings").controls.prepend(controls.aiServiceStatus);
    if (imageThumb) pages.get("image").actions.prepend(imageThumb);
    if (canvasStage) pages.get("image").preview.append(canvasStage);
    if (timeline) pages.get("image").timeline.append(timeline);
    if (viewerHost) pages.get("viewer").preview.append(viewerHost);
    pages.get("image").exports.append(createExportMenu());
    if (exportActions) pages.get("image").exports.querySelector(".workspace-export-panel").append(exportActions);

    const fileButtons = moveFileButtons(pages);
    const voxelizeButtons = addVoxelizeActions(pages);
    const referenceImage = addReferenceImageAction(pages.get("structure").actions);
    const materialEmpty = createMaterialsEmptyState(pages.get("materials").context);
    const statusNodes = new Map([...pages].map(([mode, page]) => [mode, page.status]));

    window.addEventListener("craftaib:language-changed", () => updateWorkspaceCopy(pages));
    updateWorkspaceCopy(pages);

    return {
        pages,
        statusNodes,
        materialEmpty,
        fileButtons,
        voxelizeButtons,
        referenceButton: referenceImage.button,
        referenceInput: referenceImage.input,
        setReferenceImage: referenceImage.setFile,
        generateButton: controls.generateButton,
        localPreviewButton: controls.localPreviewButton,
        generationSource: controls.generationSource,
        aiServiceStatus: controls.aiServiceStatus,
        activate: activateWorkspace,
    };

    function activateWorkspace(mode) {
        const active = normalizeWorkspaceId(mode);
        const definition = WORKSPACES.find((item) => item.id === active);
        const page = pages.get(active);
        if (!definition || !page) return false;

        document.body.dataset.mode = active;
        for (const [id, item] of pages) {
            item.element.hidden = id !== active;
            item.navButton.classList.toggle("is-active", id === active);
            if (id === active) item.navButton.setAttribute("aria-current", "page");
            else item.navButton.removeAttribute("aria-current");
        }
        pages.get(active).navButton.closest("details")?.setAttribute("open", "");
        pages.get(active).navButton.closest(".workspace-nav-toolbox")?.setAttribute("open", "");

        if (definition.preview && canvasStage) page.preview.append(canvasStage);
        if (definition.timeline && timeline) page.timeline.append(timeline);
        arrangeBuilderExports(active);
        if (definition.exports && exportActions) {
            const menu = page.exports.querySelector(".workspace-export-menu") ?? createExportMenu();
            page.exports.append(menu);
            menu.querySelector(".workspace-export-panel").append(exportActions);
        }
        if (definition.palette && controls.palette) page.context.append(controls.palette);
        if (definition.layers && controls.sceneLayers) page.context.append(controls.sceneLayers);
        if (definition.litematic && controls.litematicInfo) {
            const empty = controls.litematicInfo.querySelector(".empty-state");
            if (empty && !window.craftaibLitematicInfo) empty.textContent = t(active === "structure" ? "emptyRegions" : "importLitematicHint");
            page.context.append(controls.litematicInfo);
        }
        if (active === "structure") {
            const emptyPreview = page.element.querySelector(".builder-preview-panel");
            emptyPreview?.classList.toggle("is-empty", !window.craftaibImportedGrid?.cells?.length);
        }
        if (active === "materials") updateMaterialsEmptyState(materialEmpty, controls.importedMaterials);
        if (document.body.classList.contains("workspace-nav-open")) sidebar.close();
        updateWorkspaceCopy(pages);
        window.dispatchEvent(new CustomEvent("craftaib:workspace-activated", { detail: active }));
        return true;
    }

    function arrangeBuilderExports(active) {
        if (!exportActions) return;
        const quickSlot = pages.get("structure").element.querySelector(".builder-primary-exports");
        for (const id of ["downloadAiLitematicButton", "downloadSchematicButton"]) {
            const button = document.getElementById(id);
            if (!button) continue;
            if (active === "structure") quickSlot?.append(button);
            else exportActions.append(button);
        }
    }
}

function createSidebar(navButtons, onModeChange) {
    const aside = document.createElement("aside");
    aside.className = "workspace-nav";
    aside.id = "workspace-navigation";
    aside.setAttribute("aria-label", t("mainNavigation"));
    const nav = document.createElement("nav");
    nav.className = "workspace-nav-groups";
    const navButtonByMode = new Map(navButtons.map((button) => [button.dataset.mode, button]));
    const structureButton = navButtonByMode.get("structure");
    const primary = document.createElement("div");
    primary.className = "workspace-nav-primary";
    structureButton.classList.add("workspace-nav-item", "workspace-nav-ai");
    structureButton.dataset.i18n = "navStructure";
    structureButton.textContent = t("navStructure");
    structureButton.addEventListener("click", () => onModeChange("structure"));
    primary.append(structureButton);
    const toolbox = document.createElement("details");
    toolbox.className = "workspace-nav-toolbox";
    const toolboxLabel = document.createElement("summary");
    toolboxLabel.dataset.i18n = "navToolbox";
    toolboxLabel.textContent = t("navToolbox");
    toolbox.append(toolboxLabel);
    const toolboxNav = document.createElement("nav");
    toolboxNav.className = "workspace-nav-tools";

    for (const group of WORKSPACE_GROUPS) {
        const section = document.createElement("details");
        section.className = "workspace-nav-group";
        section.open = false;
        const summary = document.createElement("summary");
        summary.dataset.groupLabel = group.id;
        summary.textContent = t(group.labelKey);
        const items = document.createElement("div");
        items.className = "workspace-nav-items";
        for (const definition of WORKSPACES.filter((item) => item.group === group.id && item.id !== "structure")) {
            const button = navButtonByMode.get(definition.id);
            if (!button) continue;
            button.type = "button";
            button.classList.add("workspace-nav-item");
            button.classList.remove("is-active");
            button.addEventListener("click", () => onModeChange(definition.id));
            items.append(button);
        }
        section.append(summary, items);
        toolboxNav.append(section);
    }
    toolbox.append(toolboxNav);

    const settingsGroup = document.createElement("div");
    settingsGroup.className = "workspace-nav-settings";
    const settingsButton = navButtonByMode.get("settings");
    if (settingsButton) {
        settingsButton.classList.add("workspace-nav-item");
        settingsButton.addEventListener("click", () => onModeChange("settings"));
        settingsGroup.append(settingsButton);
    }

    const backdrop = document.createElement("button");
    backdrop.type = "button";
    backdrop.className = "workspace-nav-backdrop";
    backdrop.setAttribute("aria-label", t("closeNavigation"));
    backdrop.addEventListener("click", close);
    aside.append(primary, toolbox, settingsGroup);
    document.querySelector(".topbar")?.prepend(createMenuToggle());
    document.querySelector(".studio-shell")?.append(backdrop);
    return { element: aside, close };

    function close() {
        document.body.classList.remove("workspace-nav-open");
        const toggle = document.querySelector("#workspace-menu-toggle");
        toggle?.setAttribute("aria-expanded", "false");
    }
}

function createMenuToggle() {
    const button = document.createElement("button");
    button.type = "button";
    button.id = "workspace-menu-toggle";
    button.className = "workspace-menu-toggle";
    button.setAttribute("aria-controls", "workspace-navigation");
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-label", t("openNavigation"));
    button.innerHTML = "<span></span><span></span><span></span>";
    button.addEventListener("click", () => {
        const open = !document.body.classList.contains("workspace-nav-open");
        document.body.classList.toggle("workspace-nav-open", open);
        button.setAttribute("aria-expanded", String(open));
    });
    return button;
}

function createPage(definition, navButton) {
    const section = document.createElement("section");
    section.className = "workspace-page";
    section.dataset.modePage = definition.id;
    section.dataset.layout = definition.layout;
    section.hidden = true;
    section.setAttribute("aria-labelledby", `workspace-title-${definition.id}`);
    if (definition.id === "structure") {
        section.innerHTML = `
          <header class="builder-page-header">
            <div class="builder-heading">
              <span class="workspace-page-kicker" data-page-kicker="${definition.group}"></span>
              <h1 id="workspace-title-${definition.id}" data-page-title="${definition.id}" tabindex="-1"></h1>
              <p data-page-description="${definition.id}"></p>
            </div>
          </header>
          <div class="builder-workbench">
            <aside class="builder-assistant" aria-label="${t("workspaceControls")}">
              <div class="builder-assistant-heading"><span data-i18n="buildBrief"></span><div class="builder-reference-slot" data-page-actions="${definition.id}"></div></div>
              <div class="workspace-control-slot" data-control-slot="${definition.id}"></div>
              <p class="workspace-status" data-workspace-status="${definition.id}" role="status" aria-live="polite"></p>
            </aside>
            <main class="builder-stage-column">
              <section class="builder-preview-panel is-empty">
                <div class="builder-preview-slot workspace-preview-slot" data-preview-slot="${definition.id}">
                  <div class="builder-empty-state"><span data-i18n="emptyStructureTitle"></span><p data-i18n="emptyStructureHint"></p></div>
                </div>
              </section>
            </main>
            <div class="builder-results">
              <div class="workspace-context-slot" data-context-slot="${definition.id}"></div>
              <div class="builder-export-area">
                <div class="builder-primary-exports" data-i18n-label="projectionExports" aria-label="${t("projectionExports")}"></div>
                <div class="workspace-export-slot" data-export-slot="${definition.id}"></div>
              </div>
            </div>
            <div class="workspace-timeline-slot" data-timeline-slot="${definition.id}" hidden></div>
          </div>`;
    } else {
        section.innerHTML = `
          <header class="workspace-page-header">
            <div class="workspace-page-heading">
              <span class="workspace-page-kicker" data-page-kicker="${definition.group}"></span>
              <h1 id="workspace-title-${definition.id}" data-page-title="${definition.id}" tabindex="-1"></h1>
              <p data-page-description="${definition.id}"></p>
            </div>
            <div class="workspace-page-actions" data-page-actions="${definition.id}"></div>
          </header>
          <div class="workspace-page-grid workspace-page-grid-${definition.id}">
            <div class="workspace-primary">
              <div class="workspace-preview-slot" data-preview-slot="${definition.id}"></div>
              <div class="workspace-timeline-slot" data-timeline-slot="${definition.id}"></div>
            </div>
            <section class="workspace-side" aria-label="${t("workspaceControls")}">
              <div class="workspace-control-slot" data-control-slot="${definition.id}"></div>
              <div class="workspace-context-slot" data-context-slot="${definition.id}"></div>
            </section>
          </div>
          <footer class="workspace-page-footer">
            <p class="workspace-status" data-workspace-status="${definition.id}" role="status" aria-live="polite"></p>
            <div class="workspace-export-slot" data-export-slot="${definition.id}"></div>
          </footer>`;
    }

    return {
        element: section,
        navButton,
        actions: section.querySelector("[data-page-actions]"),
        preview: section.querySelector(".workspace-preview-slot"),
        timeline: section.querySelector(".workspace-timeline-slot"),
        controls: section.querySelector(".workspace-control-slot"),
        context: section.querySelector(".workspace-context-slot"),
        exports: section.querySelector(".workspace-export-slot"),
        status: section.querySelector(".workspace-status"),
    };
}

function collectWorkspaceControls(inspector) {
    const imageControls = inspector.querySelector("#settings-image");
    const palette = inspector.querySelector(".palette-section");
    const sceneLayers = inspector.querySelector(".scene-layers");
    const litematicInfo = inspector.querySelector(".litematic-info-section");
    const settings3d = inspector.querySelector("#settings-3d");
    const projectControls = settings3d?.querySelector("#settings-project");
    const structureControls = settings3d?.querySelector(".structure-controls");
    const promptLabel = structureControls?.querySelector("#ai-building-prompt")?.closest("label");
    const generateButton = structureControls?.querySelector("#generate-ai-building");
    const oldReferenceButton = structureControls?.querySelector("#generate-reference-building");
    const oldStructureButton = structureControls?.querySelector("#generate-structure");
    const promptInputs = document.createElement("div");
    promptInputs.className = "building-prompt-inputs";
    if (promptLabel) promptInputs.append(promptLabel);
    if (oldReferenceButton) oldReferenceButton.remove();
    if (oldStructureButton) oldStructureButton.remove();
    for (const fieldId of ["structure-type", "structure-style", "structure-floors", "structure-width", "structure-length", "structure-seed"]) {
        const field = structureControls?.querySelector(`#${fieldId}`)?.closest("label");
        if (field) promptInputs.append(field);
    }
    const advancedSettings = document.createElement("details");
    advancedSettings.className = "building-advanced-settings";
    advancedSettings.innerHTML = `<summary data-i18n="advancedGenerationSettings"></summary>`;
    const settingFields = document.createElement("div");
    settingFields.className = "building-advanced-fields";
    settingFields.append(...promptInputs.querySelectorAll("label[for^='structure-'], label:has(#structure-type), label:has(#structure-style), label:has(#structure-floors), label:has(#structure-width), label:has(#structure-length), label:has(#structure-seed)"));
    advancedSettings.append(settingFields);
    const localPreviewButton = document.createElement("button");
    localPreviewButton.id = "generate-local-preview";
    localPreviewButton.type = "button";
    localPreviewButton.className = "quiet-button";
    localPreviewButton.dataset.i18n = "generateLocalPreview";
    localPreviewButton.textContent = t("generateLocalPreview");
    localPreviewButton.hidden = true;
    const cancelGenerationButton = document.createElement("button");
    cancelGenerationButton.id = "cancel-building-generation";
    cancelGenerationButton.type = "button";
    cancelGenerationButton.className = "quiet-button";
    cancelGenerationButton.dataset.i18n = "cancelGeneration";
    cancelGenerationButton.textContent = t("cancelGeneration");
    cancelGenerationButton.hidden = true;
    const generationSource = document.createElement("p");
    generationSource.id = "ai-generation-source";
    generationSource.className = "ai-generation-source";
    generationSource.setAttribute("role", "status");
    const aiServiceStatus = document.createElement("section");
    aiServiceStatus.id = "ai-service-status";
    aiServiceStatus.className = "ai-service-status";
    aiServiceStatus.innerHTML = `<h2 data-i18n="aiService"></h2><p data-service-status></p>`;
    const geoControls = settings3d?.querySelector(".geo-controls");
    const legoControls = settings3d?.querySelector(".lego-controls");
    const mapArtControls = settings3d?.querySelector(".map-art-controls");
    const voxelControls = document.createElement("section");
    voxelControls.id = "voxel-controls";
    voxelControls.className = "inspector-section voxel-controls";
    const cameraControls = document.createElement("section");
    cameraControls.className = "voxel-camera-controls";
    cameraControls.innerHTML = `<div class="section-title"><h2 data-i18n="cameraAndVolume"></h2></div>`;
    const compatibleInputs = settings3d?.querySelector(".hidden-compatible-controls");
    for (const [labelKey, sliderId, numberId] of [
        ["fieldOfView", "fov-slider", "fov-number"],
        ["cameraYaw", "yaw-slider", "yaw-number"],
        ["cameraPitch", "pitch-slider", "pitch-number"],
        ["depthNear", "depth-min", "depth-min-number"],
        ["depthFar", "depth-max", "depth-max-number"],
        ["voxelDetail", "detail", "detail-number"],
    ]) {
        const slider = compatibleInputs?.querySelector(`#${sliderId}`);
        const number = compatibleInputs?.querySelector(`#${numberId}`);
        if (!slider || !number) continue;
        const label = document.createElement("label");
        label.className = "voxel-camera-field";
        const caption = document.createElement("span");
        caption.dataset.i18n = labelKey;
        caption.textContent = t(labelKey);
        label.append(caption, slider, number);
        cameraControls.append(label);
    }
    for (const control of [
        settings3d?.querySelector(":scope > .section-title"),
        ...[...(settings3d?.querySelectorAll(":scope > .toggle-row") ?? [])],
        settings3d?.querySelector(":scope > .grid-view-controls"),
    ]) if (control) voxelControls.append(control);
    if (cameraControls.querySelector(".voxel-camera-field")) voxelControls.append(cameraControls);
    const endpointFields = ["vision-endpoint", "vision-model"].map((id) => settings3d?.querySelector(`#${id}`)?.closest("label")).filter(Boolean);
    endpointFields.forEach((field) => field.remove());
    const brief = promptInputs.querySelector("#ai-building-prompt")?.closest("label");
    if (brief) brief.classList.add("building-prompt-field");
    if (generateButton) {
        generateButton.classList.remove("quiet-button");
        generateButton.classList.add("primary-button", "building-generate-button");
        generateButton.dataset.i18n = "generateBuilding";
        generateButton.textContent = t("generateBuilding");
        generateButton.setAttribute("aria-describedby", "ai-generation-source");
    }
    if (brief) structureControls.insertBefore(brief, generateButton);
    if (generateButton) {
        structureControls.insertBefore(generationSource, generateButton);
        structureControls.insertBefore(localPreviewButton, generateButton.nextSibling);
        structureControls.insertBefore(cancelGenerationButton, localPreviewButton.nextSibling);
        structureControls.insertBefore(advancedSettings, cancelGenerationButton.nextSibling);
    }
    settings3d?.remove();
    inspector.querySelector(".inspector-header")?.remove();
    inspector.querySelector(".voxel-card")?.remove();
    return {
        imageControls, palette, sceneLayers, litematicInfo, voxelControls,
        structureControls, geoControls, legoControls, mapArtControls, projectControls,
        generateButton, localPreviewButton, cancelGenerationButton, generationSource, aiServiceStatus,
        importedMaterials: palette?.querySelector("#imported-materials"),
        compatibilityControls: settings3d?.querySelector(".hidden-compatible-controls"),
    };
}

function moveFileButtons(pages) {
    const buttonModes = {
        "open-schematic": "schematic", "open-litematic": "schematic", "open-grid": "schematic",
        "open-placement": "viewer", "open-geojson": "geo", "open-ldraw": "lego",
    };
    for (const [id, mode] of Object.entries(buttonModes)) {
        const button = document.getElementById(id);
        if (button) pages.get(mode).actions.append(button);
    }
    for (const id of ["open-project", "save-project"]) {
        const button = document.getElementById(id);
        if (button) pages.get("settings").actions.append(button);
    }
    for (const definition of WORKSPACES) {
        for (const action of definition.imports ?? []) {
            if (action.buttonId) continue;
            if (definition.id === "image" && action.inputId === "image-input") continue;
            const button = createImportButton(action.labelKey);
            button.dataset.openInput = action.inputId;
            button.addEventListener("click", () => document.getElementById(action.inputId)?.click());
            pages.get(definition.id).actions.append(button);
        }
    }
    return buttonModes;
}

function createImportButton(labelKey = "importFile") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "quiet-button workspace-import-button";
    button.dataset.i18n = labelKey;
    button.textContent = t(labelKey);
    window.addEventListener("craftaib:language-changed", () => { button.textContent = t(labelKey); });
    return button;
}

function addVoxelizeActions(pages) {
    const buttons = [];
    for (const mode of ["map-art", "voxel"]) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "primary-button workspace-voxelize-action";
        button.dataset.action = "voxelize";
        button.textContent = t("runVoxelizer");
        window.addEventListener("craftaib:language-changed", () => { button.textContent = t("runVoxelizer"); });
        pages.get(mode).actions.append(button);
        buttons.push(button);
    }
    return buttons;
}

function addReferenceImageAction(slot) {
    const button = createImportButton("referenceImage");
    button.classList.add("reference-image-action");
    const input = document.createElement("input");
    input.type = "file";
    input.id = "reference-image-input";
    input.accept = "image/*";
    input.hidden = true;
    button.addEventListener("click", () => input.click());
    const preview = document.createElement("span");
    preview.id = "building-reference-preview";
    preview.className = "building-reference-preview";
    preview.hidden = true;
    const image = document.createElement("img");
    image.alt = "";
    const name = document.createElement("span");
    preview.append(image, name);
    slot.prepend(button, input, preview);
    let objectUrl = null;
    return {
        button,
        input,
        setFile(file) {
            if (objectUrl) URL.revokeObjectURL(objectUrl);
            objectUrl = file ? URL.createObjectURL(file) : null;
            preview.hidden = !file;
            if (!file) return;
            image.src = objectUrl;
            name.textContent = file.name;
        },
    };
}

function createMaterialsEmptyState(slot) {
    const empty = document.createElement("p");
    empty.id = "materials-empty-state";
    empty.className = "materials-empty-state";
    empty.textContent = t("materialsEmpty");
    slot.prepend(empty);
    window.addEventListener("craftaib:language-changed", () => { empty.textContent = t("materialsEmpty"); });
    return empty;
}

function createExportMenu() {
    const menu = document.createElement("details");
    menu.className = "workspace-export-menu";
    menu.innerHTML = `<summary data-i18n="exportFormats">${t("exportFormats")}</summary><div class="workspace-export-panel"></div>`;
    window.addEventListener("craftaib:language-changed", () => { menu.querySelector("summary").textContent = t("exportFormats"); });
    return menu;
}

function updateWorkspaceCopy(pages) {
    for (const [mode, page] of pages) {
        page.element.querySelector("[data-page-title]").textContent = getModeTitle(mode);
        page.element.querySelector("[data-page-description]").textContent = getModeHint(mode);
        page.element.querySelector("[data-page-kicker]").textContent = t(`navGroup${modeGroupName(mode)}`);
        page.element.querySelectorAll("[data-i18n-label]").forEach((node) => node.setAttribute("aria-label", t(node.dataset.i18nLabel)));
    }
}

function modeGroupName(mode) {
    const group = WORKSPACES.find((item) => item.id === mode)?.group;
    return ({ create: "Create", files: "Files", extensions: "Extensions", settings: "Settings" })[group] ?? "Create";
}

function updateMaterialsEmptyState(empty, importedMaterials) {
    empty.hidden = Boolean(window.craftaibImportedGrid?.cells?.length || importedMaterials?.children.length);
}

export { initializeWorkspaceUI };
