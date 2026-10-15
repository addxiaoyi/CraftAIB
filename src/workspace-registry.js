const WORKSPACE_GROUPS = [
    { id: "create", labelKey: "navGroupCreate" },
    { id: "files", labelKey: "navGroupFiles" },
    { id: "extensions", labelKey: "navGroupExtensions" },
];

const WORKSPACES = [
    { id: "structure", group: "primary", layout: "builder", preview: true, control: ".structure-controls", litematic: true, exports: true },
    { id: "image", group: "create", layout: "image", preview: true, control: "#settings-image", palette: true, timeline: true, exports: true, imports: [{ inputId: "image-input", labelKey: "upload" }] },
    { id: "map-art", group: "create", layout: "map-art", preview: true, control: ".map-art-controls", palette: true, exports: true, imports: [{ inputId: "image-input", labelKey: "upload" }] },
    { id: "voxel", group: "create", layout: "voxel", preview: true, control: "#voxel-controls", palette: true, layers: true, exports: true, imports: [{ inputId: "image-input", labelKey: "upload" }] },
    { id: "schematic", group: "files", layout: "schematic", preview: true, layers: true, litematic: true, palette: true, exports: true, imports: [{ buttonId: "open-schematic" }, { buttonId: "open-litematic" }, { buttonId: "open-grid" }] },
    { id: "viewer", group: "files", layout: "viewer", preview: true, layers: true, litematic: true, exports: true, imports: [{ inputId: "litematic-input", labelKey: "openLitematic" }] },
    { id: "materials", group: "files", layout: "materials", palette: true, imports: [{ inputId: "schematic-input", labelKey: "openSchematic" }, { inputId: "litematic-input", labelKey: "openLitematic" }, { inputId: "grid-input", labelKey: "openGrid" }] },
    { id: "geo", group: "extensions", layout: "geo", preview: true, control: ".geo-controls", layers: true, exports: true, imports: [{ buttonId: "open-geojson" }] },
    { id: "lego", group: "extensions", layout: "lego", preview: true, control: ".lego-controls", layers: true, exports: true, imports: [{ buttonId: "open-ldraw" }] },
    { id: "settings", group: "settings", layout: "settings", control: "#settings-project", vision: true },
];

const MODE_LABEL_ORDER = ["image", "map-art", "voxel", "structure", "schematic", "viewer", "lego", "geo", "materials", "settings"];
const VALID_WORKSPACES = new Set(WORKSPACES.map(({ id }) => id));

function normalizeWorkspaceId(value) {
    const raw = String(value ?? "").trim();
    const normalized = raw.toLowerCase().replaceAll("_", "-").replaceAll(" ", "-");
    if (VALID_WORKSPACES.has(normalized)) return normalized;
    const aliases = {
        "building-generator": "structure", "building": "structure", "reference-image": "image",
        "map-art-preview": "map-art", "voxel-output": "voxel", "schematic-inspection": "schematic",
        "3d-structure-viewer": "viewer", "ldraw-scene": "lego", "geo-scene": "geo",
        "material-inventory": "materials", "project-settings": "settings",
        "图片": "image", "地图艺术": "map-art", "体素": "voxel", "建筑": "structure",
        "投影文件": "schematic", "查看器": "viewer", "地理场景": "geo", "材料": "materials", "设置": "settings",
    };
    if (aliases[normalized]) return aliases[normalized];
    return MODE_LABEL_ORDER[Number(raw)] ?? "structure";
}

export { MODE_LABEL_ORDER, VALID_WORKSPACES, WORKSPACE_GROUPS, WORKSPACES, normalizeWorkspaceId };
