const STORAGE_KEY = 'craftaib.language';
const LANGS = ['en', 'zh'];
const translations = {"en": {"language": "\u4e2d\u6587", "nav": ["Image", "Map Art", "Voxel", "Structure", "Schematic", "Viewer", "LEGO", "Geo Scene", "Materials", "Settings"], "openGeo": "Open GeoJSON", "openLdraw": "Open LDraw", "openGrid": "Open Grid", "openLitematic": "Open .LITEMATIC", "openPlacement": "Open placement JSON", "openSchematic": "Open .SCHEM", "openProject": "Open", "saveProject": "Save", "select": "Select", "voxel": "Voxel", "materials": "Materials", "settings": "Settings", "upload": "Upload image", "resetImage": "Reset image", "resetView": "Reset view", "close": "Close", "rewind": "Rewind", "runVoxelizer": "Run voxelizer", "nextStep": "Next step", "exportLitematic": "Export .LITEMATIC", "exportAiRegions": "Export AI regions", "exportViewer": "Export Viewer", "exportGlb": "Export GLB", "exportSchem": "Export .SCHEM", "exportGrid": "Export Grid", "exportNbt": "Export NBT", "cancel": "Cancel", "add": "Add", "mergeVisible": "Merge visible", "viewer3d": "3D viewer", "analyzeInventory": "Analyze inventory", "exportMaterials": "Export materials", "exportPng": "PNG", "generateBuilding": "Generate real building", "buildReference": "Build from reference image", "generateStructure": "Generate structure", "modeSummary": {"image": "Reference image -> palette preview", "map-art": "Map Art / staircase / palette balance", "voxel": "Perspective volume / depth / dithering", "structure": "AI building / named Litematica regions", "schematic": "Import / inspect / convert", "viewer": "Edit / region overlays / placement", "lego": "LDraw / parts / material mapping", "geo": "Terrain / roads / vegetation", "materials": "Inventory / substitutions / export", "settings": "Project defaults / cache / restore"}, "waitingOutput": "Waiting for voxel output", "livePreview": "Live preview", "inspector": "INSPECTOR", "voxelPreview": "Voxel preview", "output": "OUTPUT", "structure3d": "3D STRUCTURE", "sceneLayers": "Scene layers", "litematica": "Litematica", "importLitematicHint": "Import a Litematic to inspect regions and placement.", "materialsTitle": "Materials", "paletteFilters": "PALETTE FILTERS", "imageControls": "Image controls", "voxelControls": "Voxel controls", "structureGenerator": "Structure generator", "visionEndpoint": "Vision endpoint", "visionModel": "Vision model", "aiBrief": "AI building brief", "visionPlaceholder": "Optional OpenAI-compatible /v1/chat/completions", "modelPlaceholder": "vision model", "aiPlaceholder": "Example: gothic castle, 3 floors, turret and courtyard, 32 x 28", "autoSaved": "Auto-saved locally", "dropHint": "Drop an image here, or click to upload", "projectSettings": "Project settings", "autoSave": "Auto-save project", "clearCache": "Clear project cache", "diagnostics": "Diagnostics", "clearCacheDone": "Local project cache cleared.", "diagnosticsDone": "Diagnostics copied to the status line.", "imageProcess": "Image process", "voxelPass": "Voxel pass", "paletteTrack": "Palette"}, "zh": {"language": "English", "nav": ["\u56fe\u7247", "\u5730\u56fe\u827a\u672f", "\u4f53\u7d20", "\u5efa\u7b51", "\u6295\u5f71\u6587\u4ef6", "\u67e5\u770b\u5668", "LEGO", "\u5730\u7406\u573a\u666f", "\u6750\u6599", "\u8bbe\u7f6e"], "openGeo": "\u6253\u5f00 GeoJSON", "openLdraw": "\u6253\u5f00 LDraw", "openGrid": "\u6253\u5f00 Grid", "openLitematic": "\u6253\u5f00 .LITEMATIC", "openPlacement": "\u6253\u5f00 Placement JSON", "openSchematic": "\u6253\u5f00 .SCHEM", "openProject": "\u6253\u5f00\u9879\u76ee", "saveProject": "\u4fdd\u5b58\u9879\u76ee", "select": "\u9009\u62e9", "voxel": "\u4f53\u7d20", "materials": "\u6750\u6599", "settings": "\u8bbe\u7f6e", "upload": "\u4e0a\u4f20\u56fe\u7247", "resetImage": "\u91cd\u7f6e\u56fe\u7247", "resetView": "\u91cd\u7f6e\u89c6\u56fe", "close": "\u5173\u95ed", "rewind": "\u56de\u5230\u5f00\u59cb", "runVoxelizer": "\u8fd0\u884c\u4f53\u7d20\u5316", "nextStep": "\u4e0b\u4e00\u9636\u6bb5", "exportLitematic": "\u5bfc\u51fa .LITEMATIC", "exportAiRegions": "\u5bfc\u51fa AI \u5206\u533a", "exportViewer": "\u5bfc\u51fa\u67e5\u770b\u5668", "exportGlb": "\u5bfc\u51fa GLB", "exportSchem": "\u5bfc\u51fa .SCHEM", "exportGrid": "\u5bfc\u51fa Grid", "exportNbt": "\u5bfc\u51fa NBT", "cancel": "\u53d6\u6d88", "add": "\u6dfb\u52a0", "mergeVisible": "\u5408\u5e76\u53ef\u89c1\u5c42", "viewer3d": "3D \u67e5\u770b\u5668", "analyzeInventory": "\u5206\u6790\u5e93\u5b58", "exportMaterials": "\u5bfc\u51fa\u6750\u6599", "exportPng": "PNG", "generateBuilding": "\u751f\u6210\u771f\u5b9e\u5efa\u7b51", "buildReference": "\u6839\u636e\u53c2\u8003\u56fe\u751f\u6210", "generateStructure": "\u751f\u6210\u7ed3\u6784", "modeSummary": {"image": "\u53c2\u8003\u56fe -> \u8c03\u8272\u677f\u9884\u89c8", "map-art": "\u5730\u56fe\u827a\u672f / \u9636\u68af / \u8c03\u8272\u677f\u5e73\u8861", "voxel": "\u900f\u89c6\u4f53\u7d20 / \u6df1\u5ea6 / \u6296\u52a8", "structure": "AI \u5efa\u7b51 / \u547d\u540d Litematica \u5206\u533a", "schematic": "\u5bfc\u5165 / \u68c0\u67e5 / \u8f6c\u6362", "viewer": "\u7f16\u8f91 / \u5206\u533a\u8fb9\u754c / Placement", "lego": "LDraw / \u96f6\u4ef6 / \u6750\u6599\u6620\u5c04", "geo": "\u5730\u5f62 / \u9053\u8def / \u690d\u88ab", "materials": "\u5e93\u5b58 / \u66ff\u4ee3\u6750\u6599 / \u5bfc\u51fa", "settings": "\u9879\u76ee\u9ed8\u8ba4\u503c / \u7f13\u5b58 / \u6062\u590d"}, "waitingOutput": "\u7b49\u5f85\u4f53\u7d20\u8f93\u51fa", "livePreview": "\u5b9e\u65f6\u9884\u89c8", "inspector": "\u68c0\u67e5\u5668", "voxelPreview": "\u4f53\u7d20\u9884\u89c8", "output": "\u8f93\u51fa", "structure3d": "\u4e09\u7ef4\u7ed3\u6784", "sceneLayers": "\u573a\u666f\u56fe\u5c42", "litematica": "Litematica", "importLitematicHint": "\u5bfc\u5165 Litematic \u4ee5\u68c0\u67e5\u5206\u533a\u548c Placement\u3002", "materialsTitle": "\u6750\u6599", "paletteFilters": "\u8c03\u8272\u677f\u7b5b\u9009", "imageControls": "\u56fe\u7247\u63a7\u5236", "voxelControls": "\u4f53\u7d20\u63a7\u5236", "structureGenerator": "\u5efa\u7b51\u751f\u6210\u5668", "visionEndpoint": "\u89c6\u89c9\u6a21\u578b Endpoint", "visionModel": "\u89c6\u89c9\u6a21\u578b", "aiBrief": "AI \u5efa\u7b51\u63cf\u8ff0", "visionPlaceholder": "\u53ef\u9009\u7684 OpenAI-compatible /v1/chat/completions", "modelPlaceholder": "\u89c6\u89c9\u6a21\u578b\u540d\u79f0", "aiPlaceholder": "\u4f8b\u5982\uff1a\u54e5\u7279\u5f0f\u57ce\u5821\uff0c3\u5c42\uff0c\u5e26\u5854\u697c\u548c\u5ead\u9662\uff0c\u5bbd32\u957f28", "autoSaved": "\u5df2\u5728\u672c\u5730\u81ea\u52a8\u4fdd\u5b58", "dropHint": "\u5c06\u56fe\u7247\u62d6\u5230\u8fd9\u91cc\uff0c\u6216\u70b9\u51fb\u4e0a\u4f20", "projectSettings": "\u9879\u76ee\u8bbe\u7f6e", "autoSave": "\u81ea\u52a8\u4fdd\u5b58\u9879\u76ee", "clearCache": "\u6e05\u9664\u9879\u76ee\u7f13\u5b58", "diagnostics": "\u8bca\u65ad\u4fe1\u606f", "clearCacheDone": "\u672c\u5730\u9879\u76ee\u7f13\u5b58\u5df2\u6e05\u9664\u3002", "diagnosticsDone": "\u8bca\u65ad\u4fe1\u606f\u5df2\u53d1\u9001\u5230\u72b6\u6001\u680f\u3002", "imageProcess": "\u56fe\u7247\u5904\u7406", "voxelPass": "\u4f53\u7d20\u901a\u9053", "paletteTrack": "\u8c03\u8272\u677f"}};
const selectors = {"#open-geojson": "openGeo", "#open-ldraw": "openLdraw", "#open-grid": "openGrid", "#open-litematic": "openLitematic", "#open-placement": "openPlacement", "#open-schematic": "openSchematic", "#open-project": "openProject", "#save-project": "saveProject", "#reset-image": "resetImage", "#reset-3d": "resetView", "#close-viewer": "close", "#convertButton": "runVoxelizer", "#downloadLitematicButton": "exportLitematic", "#downloadAiLitematicButton": "exportAiRegions", "#downloadViewerButton": "exportViewer", "#downloadGlbButton": "exportGlb", "#downloadSchematicButton": "exportSchem", "#downloadGridButton": "exportGrid", "#downloadButton": "exportNbt", "#cancel-export": "cancel", "#add-scene-layer": "add", "#merge-scene-layers": "mergeVisible", "#open-unified-viewer": "viewer3d", "#analyze-materials": "analyzeInventory", "#export-materials": "exportMaterials", "#export-grid-preview": "exportPng", "#generate-ai-building": "generateBuilding", "#generate-reference-building": "buildReference", "#generate-structure": "generateStructure", "#lego-default-colors": "loadDefaults", "#lego-export-colors": "exportMapping", "#clear-project-cache": "clearCache", "#show-diagnostics": "diagnostics"};
delete selectors["#convertButton"];
Object.assign(selectors, { "#lego-default-colors": "loadDefaults", "#lego-export-colors": "exportMapping" });
const staticSelectors = {".inspector-header .eyebrow": "inspector", ".inspector-header h1": "voxelPreview", ".voxel-details .eyebrow": "output", ".voxel-details strong": "structure3d", ".scene-layers h2": "sceneLayers", ".litematic-info-section h2": "litematica", ".palette-section h2": "materialsTitle", ".palette-header .eyebrow": "paletteFilters", "#settings-image h2": "imageControls", "#settings-3d h2": "voxelControls", ".structure-controls h2": "structureGenerator", "#vision-endpoint": "visionEndpoint", "#vision-model": "visionModel", "#ai-building-prompt": "aiBrief", ".save-state": "autoSaved", ".canvas-hint": "dropHint", ".canvas-footer > span:first-child": "livePreview", "#settings-project h2": "projectSettings", ".timeline-track:nth-of-type(1) .track-label": "imageProcess", ".timeline-track:nth-of-type(2) .track-label": "voxelPass", ".timeline-track:nth-of-type(3) .track-label": "paletteTrack", "#settings-project label": "autoSave"};
delete staticSelectors["#settings-3d h2"];
Object.assign(staticSelectors, {
    "#settings-3d > .section-title h2": "voxelControls",
    ".geo-controls h2": "geoSceneTitle",
    ".lego-controls h2": "legoMappingTitle",
    ".map-art-controls h2": "mapArtTitle",
    "label[for='map-art-dither']": "dithering",
    ".geo-controls .toggle-row label": "vegetation",
});
const controlTranslations = {
    en: {
        materialsPageTitle: "Material inventory", materialsPageDescription: "Compare required blocks with available stock and substitutions.", materialsEmpty: "Import a Schematic, Litematic, or BlockGrid to calculate material requirements.", settingsPageTitle: "Project settings", settingsPageDescription: "Configure local project storage and inspect the current workspace.", generateMapArt: "Generate Map Art", openStructure: "Import structure",
        modeTitles: { image: "Reference image", "map-art": "Map Art preview", voxel: "Voxel output", structure: "Building generator", schematic: "Schematic inspection", viewer: "3D structure viewer", lego: "LDraw scene", geo: "Geo scene", materials: "Material inventory", settings: "Project settings" },
        modeHints: { image: "Drop an image here, or click to upload", "map-art": "Upload an image, run voxelization, then generate Map Art.", voxel: "Upload an image and run voxelization to build a BlockGrid.", structure: "Describe a building or add a reference image to create a structure.", schematic: "Open a Schematic or Litematic to inspect its regions and blocks.", viewer: "Open a structure file, then edit its regions in the 3D viewer.", lego: "Open an LDraw model to convert its parts into a scene.", geo: "Open GeoJSON to build a terrain and road scene.", materials: "Import a structure to calculate its block inventory.", settings: "" },
        loadDefaults: "Load default colors", exportMapping: "Export mapping", geoSceneTitle: "Geo Scene", legoMappingTitle: "LEGO mapping", mapArtTitle: "Map Art", dithering: "Dithering", vegetation: "Vegetation",
        structureType: "Type", structureStyle: "Style", floors: "Floors", width: "Width", length: "Length", seed: "Seed", aiBrief: "AI building brief", visionEndpoint: "Vision endpoint", visionModel: "Vision model",
        centerLat: "Center lat", centerLng: "Center lng", ground: "Ground", road: "Road", building: "Building", elevation: "Elevation", vegetationBlock: "Vegetation block", staircasing: "Staircasing", height: "Height",
        renderExterior: "Exterior", renderFloor: "Floor plan", renderCutaway: "Cutaway", stairNone: "None", stairBaseline: "Baseline", stairContinuous: "Continuous", stairBoundary: "Boundary",
    },
    zh: {
        materialsPageTitle: "材料清单", materialsPageDescription: "对照所需方块、现有库存和替代材料。", materialsEmpty: "导入 Schematic、Litematic 或 BlockGrid 后即可计算材料需求。", settingsPageTitle: "项目设置", settingsPageDescription: "配置本地项目存储并查看当前工作区状态。", generateMapArt: "生成地图艺术",
        modeTitles: { image: "参考图", "map-art": "地图艺术预览", voxel: "体素结果", structure: "建筑生成器", schematic: "投影文件检查", viewer: "三维结构查看器", lego: "LDraw 场景", geo: "地理场景", materials: "材料清单", settings: "项目设置" },
        modeHints: { image: "将图片拖到这里，或点击上传", "map-art": "先上传图片并运行体素化，再生成地图艺术。", voxel: "上传图片并运行体素化，生成 BlockGrid。", structure: "描述建筑，或添加参考图来生成结构。", schematic: "打开 Schematic 或 Litematic，检查区域和方块。", viewer: "打开建筑文件，再进入三维查看器编辑区域。", lego: "打开 LDraw 模型，将零件转换为场景。", geo: "打开 GeoJSON，生成地形和道路场景。", materials: "导入建筑文件后计算材料清单。", settings: "" },
        loadDefaults: "加载默认颜色", exportMapping: "导出映射", geoSceneTitle: "地理场景", legoMappingTitle: "LEGO 材料映射", mapArtTitle: "地图艺术", dithering: "抖动", vegetation: "植被",
        structureType: "类型", structureStyle: "风格", floors: "楼层", width: "宽度", length: "长度", seed: "种子", aiBrief: "建筑描述", visionEndpoint: "视觉模型接口", visionModel: "视觉模型",
        centerLat: "中心纬度", centerLng: "中心经度", ground: "地面方块", road: "道路方块", building: "建筑方块", elevation: "高度数据", vegetationBlock: "植被方块", staircasing: "阶梯方式", height: "高度",
        renderExterior: "外观", renderFloor: "平面图", renderCutaway: "剖切图", stairNone: "无", stairBaseline: "基线", stairContinuous: "连续", stairBoundary: "边界",
    },
};
Object.assign(controlTranslations.en, {
    navGroupCreate: "Create",
    navGroupFiles: "Structures",
    navGroupExtensions: "Extensions",
    navGroupSettings: "Preferences",
    mainNavigation: "Workspaces",
    closeNavigation: "Close navigation",
    openNavigation: "Open navigation",
    workspaceControls: "Workspace controls",
    referenceImage: "Add reference image",
    importFile: "Import file",
    exportFormats: "Export format",
    runVoxelizer: "Voxelize image",
    advancedVision: "Vision model connection",
    required: "Required",
    availableCount: "Available blocks",
    substituteIds: "Substitute block IDs, comma separated",
    ready: "Ready",
    missingStatus: "Missing",
    cameraAndVolume: "Camera and volume",
    fieldOfView: "Field of view",
    cameraYaw: "Camera yaw",
    cameraPitch: "Camera pitch",
    depthNear: "Near depth",
    depthFar: "Far depth",
    voxelDetail: "Voxel detail",
});
Object.assign(controlTranslations.zh, {
    navGroupCreate: "创作",
    navGroupFiles: "结构文件",
    navGroupExtensions: "扩展工具",
    navGroupSettings: "偏好设置",
    mainNavigation: "工作区导航",
    closeNavigation: "关闭导航",
    openNavigation: "打开导航",
    workspaceControls: "工作区控件",
    referenceImage: "添加参考图",
    importFile: "导入文件",
    exportFormats: "导出格式",
    runVoxelizer: "生成体素",
    advancedVision: "视觉模型连接",
    required: "需求",
    availableCount: "库存数量",
    substituteIds: "替代方块 ID，多个用逗号分隔",
    ready: "充足",
    missingStatus: "缺料",
    cameraAndVolume: "相机与体积",
    fieldOfView: "视场角",
    cameraYaw: "水平角度",
    cameraPitch: "俯仰角度",
    depthNear: "近景深度",
    depthFar: "最远深度",
    voxelDetail: "体素细节",
});
Object.assign(controlTranslations.en, {
    navStructure: "AI Building", navToolbox: "Toolbox", generateBuilding: "Generate building",
    buildBrief: "Plan your build", emptyStructureTitle: "Your structure preview",
    emptyStructureHint: "Describe a building to create a voxel model and projection file.",
    blockUnit: "blocks",
    emptyRegions: "Named regions will appear after generation.", projectionExports: "Projection files", exportFormats: "Other export formats",
    buildingPreviewHint: "Your generated structure preview will appear here.",
    generateLocalPreview: "Use local preview", advancedGenerationSettings: "Generation settings",
    aiService: "Model service", aiServiceReady: "Connected", aiServiceUnavailable: "Model service unavailable. Local preview remains available.",
    aiServiceMissing: "No model configured. Generation uses a labeled local preview.",
    planningBuilding: "Planning building...", localPlanning: "Creating a local preview...",
    aiGeneratedSource: "AI-generated building plan.", localGeneratedSource: "Local preview. No AI model was used.",
    buildingGenerated: "Building generated. Export its Litematic or Schematic.",
    localGenerated: "Local preview generated. Configure a model service for AI planning.",
    generationFailed: "AI planning failed.", generationFailedRecovery: "Your inputs are preserved. Retry or choose a local preview.",
    cancelGeneration: "Cancel generation", generationCancelled: "Generation cancelled. Your inputs are preserved.",
});
Object.assign(controlTranslations.zh, {
    navStructure: "AI \u5efa\u7b51", navToolbox: "\u5de5\u5177\u7bb1", generateBuilding: "\u751f\u6210\u5efa\u7b51",
    buildBrief: "\u89c4\u5212\u5efa\u7b51", emptyStructureTitle: "\u7ed3\u6784\u9884\u89c8",
    emptyStructureHint: "\u63cf\u8ff0\u5efa\u7b51\uff0c\u751f\u6210\u4f53\u7d20\u6a21\u578b\u548c\u6295\u5f71\u6587\u4ef6\u3002",
    blockUnit: "\u65b9\u5757",
    emptyRegions: "\u751f\u6210\u540e\u4f1a\u663e\u793a\u547d\u540d\u5206\u533a\u3002", projectionExports: "\u6295\u5f71\u6587\u4ef6", exportFormats: "\u5176\u4ed6\u5bfc\u51fa\u683c\u5f0f",
    buildingPreviewHint: "\u751f\u6210\u7684\u5efa\u7b51\u4f1a\u663e\u793a\u5728\u8fd9\u91cc\u3002",
    generateLocalPreview: "\u6539\u7528\u672c\u5730\u9884\u89c8", advancedGenerationSettings: "\u751f\u6210\u8bbe\u7f6e",
    aiService: "\u6a21\u578b\u670d\u52a1", aiServiceReady: "\u5df2\u8fde\u63a5", aiServiceUnavailable: "\u6a21\u578b\u670d\u52a1\u4e0d\u53ef\u7528\uff0c\u4ecd\u53ef\u751f\u6210\u672c\u5730\u9884\u89c8\u3002",
    aiServiceMissing: "\u672a\u914d\u7f6e\u6a21\u578b\uff0c\u751f\u6210\u7ed3\u679c\u5c06\u6807\u8bb0\u4e3a\u672c\u5730\u9884\u89c8\u3002",
    planningBuilding: "\u6b63\u5728\u89c4\u5212\u5efa\u7b51...", localPlanning: "\u6b63\u5728\u751f\u6210\u672c\u5730\u9884\u89c8...",
    aiGeneratedSource: "AI \u5efa\u7b51\u65b9\u6848\u5df2\u751f\u6210\u3002", localGeneratedSource: "\u672c\u5730\u9884\u89c8\uff0c\u672a\u4f7f\u7528 AI \u6a21\u578b\u3002",
    buildingGenerated: "\u5efa\u7b51\u5df2\u751f\u6210\uff0c\u73b0\u5728\u53ef\u5bfc\u51fa Litematic \u6216 Schematic\u3002",
    localGenerated: "\u672c\u5730\u9884\u89c8\u5df2\u751f\u6210\uff0c\u914d\u7f6e\u6a21\u578b\u670d\u52a1\u540e\u53ef\u4f7f\u7528 AI \u89c4\u5212\u3002",
    generationFailed: "AI \u89c4\u5212\u5931\u8d25\u3002", generationFailedRecovery: "\u5df2\u4fdd\u7559\u8f93\u5165\uff0c\u53ef\u91cd\u8bd5\u6216\u6539\u7528\u672c\u5730\u9884\u89c8\u3002",
    cancelGeneration: "\u53d6\u6d88\u751f\u6210", generationCancelled: "\u5df2\u53d6\u6d88\u751f\u6210\uff0c\u8f93\u5165\u5df2\u4fdd\u7559\u3002",
});
Object.assign(controlTranslations.en.modeTitles, { structure: "AI building" });
Object.assign(controlTranslations.zh.modeTitles, { structure: "AI \u5efa\u7b51" });
Object.assign(controlTranslations.en.modeHints, { structure: "Describe a Minecraft building, optionally add a reference image, then export a ready-to-place structure." });
Object.assign(controlTranslations.zh.modeHints, { structure: "\u63cf\u8ff0 Minecraft \u5efa\u7b51\u5e76\u53ef\u9009\u6dfb\u52a0\u53c2\u8003\u56fe\uff0c\u751f\u6210\u540e\u5bfc\u51fa\u53ef\u653e\u7f6e\u7684\u7ed3\u6784\u6587\u4ef6\u3002" });
translations.en.generateBuilding = controlTranslations.en.generateBuilding;
translations.zh.generateBuilding = controlTranslations.zh.generateBuilding;
translations.en.exportAiRegions = "Export named-region Litematic";
translations.zh.exportAiRegions = "\u5bfc\u51fa\u547d\u540d\u5206\u533a Litematic";
const fieldLabels = {
    "#structure-type": "structureType", "#structure-style": "structureStyle", "#structure-floors": "floors", "#structure-width": "width", "#structure-length": "length", "#structure-seed": "seed", "#ai-building-prompt": "aiBrief", "#vision-endpoint": "visionEndpoint", "#vision-model": "visionModel",
    "#geo-center-lat": "centerLat", "#geo-center-lng": "centerLng", "#geo-width": "width", "#geo-length": "length", "#geo-ground-block": "ground", "#geo-road-block": "road", "#geo-building-block": "building", "#geo-elevation": "elevation", "#geo-vegetation-block": "vegetationBlock",
    "#map-art-staircase": "staircasing", "#map-art-width": "width", "#map-art-height": "height",
};
const optionLabels = {
    "#grid-render-mode": { iso: "renderExterior", floor: "renderFloor", cutaway: "renderCutaway" },
    "#map-art-staircase": { none: "stairNone", baseline: "stairBaseline", continuous: "stairContinuous", boundary: "stairBoundary" },
};
const structureOptions = {
    "#structure-type": {
        en: { house: "House", tower: "Tower", castle: "Castle", dungeon: "Dungeon", ship: "Ship", cathedral: "Cathedral", bridge: "Bridge", windmill: "Windmill", marketplace: "Marketplace", village: "Village" },
        zh: { house: "房屋", tower: "塔楼", castle: "城堡", dungeon: "地牢", ship: "船", cathedral: "教堂", bridge: "桥梁", windmill: "风车", marketplace: "集市", village: "村庄" },
    },
    "#structure-style": {
        en: { fantasy: "Fantasy", medieval: "Medieval", modern: "Modern", gothic: "Gothic", rustic: "Rustic", steampunk: "Steampunk", elven: "Elven", desert: "Desert", underwater: "Underwater", colonial: "Colonial" },
        zh: { fantasy: "奇幻", medieval: "中世纪", modern: "现代", gothic: "哥特", rustic: "乡村", steampunk: "蒸汽朋克", elven: "精灵", desert: "沙漠", underwater: "水下", colonial: "殖民" },
    },
};
let currentLanguage = 'en';
const navModesByLabelIndex = ["image", "map-art", "voxel", "structure", "schematic", "viewer", "lego", "geo", "materials", "settings"];
window.addEventListener('craftaib:language-changed', ({ detail }) => {
    const labels = translations[detail]?.nav;
    if (labels) document.querySelectorAll('.nav-item').forEach((item) => {
        const index = navModesByLabelIndex.indexOf(item.dataset.mode);
        if (index >= 0) item.textContent = labels[index];
    });
    document.querySelectorAll('[data-group-label]').forEach((node) => {
        const key = ({ create: 'navGroupCreate', files: 'navGroupFiles', extensions: 'navGroupExtensions' })[node.dataset.groupLabel];
        if (key) node.textContent = t(key);
    });
    document.querySelectorAll('[data-i18n]').forEach((node) => { node.textContent = t(node.dataset.i18n); });
    const workspaceNav = document.querySelector("#workspace-navigation");
    workspaceNav?.setAttribute("aria-label", t("mainNavigation"));
    const menuToggle = document.querySelector("#workspace-menu-toggle");
    menuToggle?.setAttribute("aria-label", t(document.body.classList.contains("workspace-nav-open") ? "closeNavigation" : "openNavigation"));
    if (document.querySelector('[data-mode-page]')) {
        const activeTitle = document.querySelector(`[data-page-title="${document.body.dataset.mode}"]`)?.textContent;
        if (activeTitle) document.title = `CraftAIB - ${activeTitle}`;
    }
});
window.addEventListener('craftaib:language-changed', ({ detail }) => {
    const mode = document.body.dataset.mode || "image";
    const title = document.querySelector('.canvas-title strong');
    if (title) title.textContent = controlTranslations[detail]?.modeTitles?.[mode] || title.textContent;
    const hint = document.querySelector('.canvas-hint');
    if (hint) hint.textContent = getModeHint(mode, detail);
    const button = document.querySelector('#convertButton');
    const label = translations[detail]?.runVoxelizer;
    if (button && label) {
        button.setAttribute('aria-label', label);
        button.title = label;
    }
    const tracks = ["imageProcess", "voxelPass", "paletteTrack"];
    document.querySelectorAll('.timeline-track .track-label').forEach((node, index) => {
        const key = tracks[index];
        if (key) setVisibleText(node, t(key));
    });
    for (const [selector, key] of Object.entries(fieldLabels)) setFieldLabel(selector, key);
    for (const [selector, options] of Object.entries(optionLabels)) {
        document.querySelectorAll(`${selector} option`).forEach((option) => {
            const key = options[option.value];
            if (key) option.textContent = t(key);
        });
    }
    for (const [selector, options] of Object.entries(structureOptions)) {
        document.querySelectorAll(`${selector} option`).forEach((option) => {
            const label = options[detail]?.[option.value];
            if (label) option.textContent = label;
        });
    }
});
function getLanguage() { const stored = localStorage.getItem(STORAGE_KEY); if (LANGS.includes(stored)) return stored; return navigator.language?.toLowerCase().startsWith('zh') ? 'zh' : 'en'; }
function t(key) { return translations[currentLanguage]?.[key] ?? controlTranslations[currentLanguage]?.[key] ?? translations.en[key] ?? controlTranslations.en[key] ?? key; }
function getModeHint(mode = document.body.dataset.mode || "image", language = currentLanguage) {
    return controlTranslations[language]?.modeHints?.[mode] ?? translations[language]?.dropHint ?? translations.en.dropHint;
}
function getModeTitle(mode = document.body.dataset.mode || "image", language = currentLanguage) {
    return controlTranslations[language]?.modeTitles?.[mode] ?? controlTranslations.en.modeTitles.image;
}
function setFieldLabel(selector, key) {
    const label = document.querySelector(selector)?.closest('label');
    if (!label) return;
    const span = label.querySelector(':scope > span');
    if (span) { setVisibleText(span, t(key)); return; }
    const textNode = [...label.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    if (textNode) textNode.textContent = `${t(key)} `;
}
function setVisibleText(node, text) { if (node.matches('.save-state, .canvas-footer > span:first-child')) { const decoration = node.querySelector('span'); node.textContent = ''; if (decoration) node.append(decoration); node.append(document.createTextNode(' ' + text)); return; } node.textContent = text; }
function applyLanguage(language = getLanguage()) { currentLanguage = LANGS.includes(language) ? language : 'en'; localStorage.setItem(STORAGE_KEY, currentLanguage); document.documentElement.lang = currentLanguage === 'zh' ? 'zh-CN' : 'en'; document.querySelectorAll('.nav-item').forEach((item,index)=>item.textContent=translations[currentLanguage].nav[index]); for (const [selector,key] of Object.entries(selectors)) document.querySelectorAll(selector).forEach(node=>setVisibleText(node,t(key))); const toolLabels = { Select: 'select', Voxel: 'voxel', Materials: 'materials', Settings: 'settings', 'Upload image': 'upload', '\u9009\u62e9': 'select', '\u4f53\u7d20': 'voxel', '\u6750\u6599': 'materials', '\u8bbe\u7f6e': 'settings', '\u4e0a\u4f20\u56fe\u7247': 'upload' }; document.querySelectorAll('.tool-button[aria-label], .asset-thumb[aria-label]').forEach((tool) => { const key = toolLabels[tool.getAttribute('aria-label') || '']; if (key) { tool.setAttribute('title', t(key)); tool.setAttribute('aria-label', t(key)); } }); for (const [selector,key] of Object.entries(staticSelectors)) document.querySelectorAll(selector).forEach(node=>{if(node instanceof HTMLInputElement||node instanceof HTMLTextAreaElement)return;setVisibleText(node,t(key));}); const prompt=document.querySelector('#ai-building-prompt'); if(prompt)prompt.placeholder=t('aiPlaceholder'); const endpoint=document.querySelector('#vision-endpoint');if(endpoint)endpoint.placeholder=t('visionPlaceholder');const model=document.querySelector('#vision-model');if(model)model.placeholder=t('modelPlaceholder');const summary=document.querySelector('#mode-summary');const mode=document.body.dataset.mode||'image';if(summary)summary.textContent=translations[currentLanguage].modeSummary[mode]||translations[currentLanguage].modeSummary.image;const toggle=document.querySelector('#language-toggle');if(toggle){toggle.textContent=t('language');toggle.setAttribute('aria-label',t('language'));}window.dispatchEvent(new CustomEvent('craftaib:language-changed',{detail:currentLanguage})); }
function initI18n(){const toggle=document.querySelector('#language-toggle');toggle?.addEventListener('click',()=>applyLanguage(currentLanguage==='en'?'zh':'en'));applyLanguage();}
export {applyLanguage,initI18n,t,getLanguage,getModeHint,getModeTitle};
