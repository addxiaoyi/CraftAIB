const DEFAULT_OFFSET = Object.freeze({ x: 0, y: 0, z: 0 });

function cloneOffset(offset = DEFAULT_OFFSET) {
    return { x: Number(offset.x) || 0, y: Number(offset.y) || 0, z: Number(offset.z) || 0 };
}

function makeLayer(grid, source = 'user', name = '') {
    if (!grid || !Array.isArray(grid.cells)) throw new Error('A valid BlockGrid is required.');
    const index = (window.craftaibSceneGraph?.layers?.length ?? 0) + 1;
    return {
        id: `layer-${Date.now()}-${index}`,
        name: name.trim() || `${source} layer ${index}`,
        source,
        visible: true,
        offset: cloneOffset(),
        grid,
    };
}

function getSceneLayers() {
    return Array.isArray(window.craftaibSceneLayers) ? window.craftaibSceneLayers : [];
}

function setSceneLayers(layers) {
    window.craftaibSceneLayers = layers;
    window.craftaibSceneGraph = {
        version: 1,
        grids: layers.map((layer) => layer.grid),
        layers: layers.map((layer, gridIndex) => ({
            id: layer.id,
            name: layer.name,
            visible: layer.visible,
            gridIndex,
            offset: cloneOffset(layer.offset),
        })),
        metadata: { sources: layers.map((layer) => layer.source) },
    };
    window.dispatchEvent(new CustomEvent('craftaib:scene-changed'));
    return window.craftaibSceneGraph;
}

function addSceneLayer(grid, source = 'user', name = '') {
    const layers = [...getSceneLayers(), makeLayer(grid, source, name)];
    setSceneLayers(layers);
    return layers.at(-1);
}

function removeSceneLayer(layerId) {
    setSceneLayers(getSceneLayers().filter((layer) => layer.id !== layerId));
}

function updateSceneLayer(layerId, patch) {
    const layers = getSceneLayers().map((layer) => layer.id === layerId ? {
        ...layer,
        ...patch,
        offset: patch.offset ? cloneOffset(patch.offset) : cloneOffset(layer.offset),
    } : layer);
    setSceneLayers(layers);
}

function clearSceneLayers() {
    setSceneLayers([]);
    window.craftaibImportedGrid = null;
}

function sceneToProjectState() {
    return getSceneLayers().map((layer) => ({
        id: layer.id,
        name: layer.name,
        source: layer.source,
        visible: layer.visible,
        offset: cloneOffset(layer.offset),
        grid: layer.grid,
    }));
}

function restoreSceneLayers(layers) {
    if (!Array.isArray(layers)) return false;
    setSceneLayers(layers.filter((layer) => layer?.grid).map((layer, index) => ({
        id: String(layer.id || `layer-restored-${index}`),
        name: String(layer.name || `Layer ${index + 1}`),
        source: String(layer.source || 'user'),
        visible: layer.visible !== false,
        offset: cloneOffset(layer.offset),
        grid: layer.grid,
    })));
    return true;
}

export {
    addSceneLayer,
    clearSceneLayers,
    getSceneLayers,
    removeSceneLayer,
    restoreSceneLayers,
    sceneToProjectState,
    setSceneLayers,
    updateSceneLayer,
};
