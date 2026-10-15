const DEFAULT_OFFSET = Object.freeze({ x: 0, y: 0, z: 0 });

function cloneOffset(offset = DEFAULT_OFFSET) {
    return { x: Number(offset.x) || 0, y: Number(offset.y) || 0, z: Number(offset.z) || 0 };
}

function getSceneLayers() {
    return Array.isArray(window.craftaibSceneLayers) ? window.craftaibSceneLayers : [];
}

function makeLayer(grid, source = 'user', name = '') {
    if (!grid || !Array.isArray(grid.cells)) throw new Error('A valid BlockGrid is required.');
    const index = getSceneLayers().length + 1;
    return { id: `layer-${Date.now()}-${index}`, name: name.trim() || `${source} layer ${index}`, source, visible: true, locked: false, selected: true, color: '#5aa6ff', offset: cloneOffset(), grid };
}

function setSceneLayers(layers) {
    const normalized = layers.map((layer, index) => ({
        ...layer,
        id: String(layer.id || `layer-${Date.now()}-${index + 1}`),
        name: String(layer.name || `Layer ${index + 1}`),
        source: String(layer.source || 'user'),
        visible: layer.visible !== false,
        locked: layer.locked === true,
        selected: layer.selected === true && !layers.slice(0, index).some((item) => item?.selected) || (index === 0 && !layers.some((item) => item?.selected)),
        color: /^#[0-9a-f]{6}$/i.test(String(layer.color)) ? String(layer.color) : '#5aa6ff',
        offset: cloneOffset(layer.offset),
    }));
    window.craftaibSceneLayers = normalized;
    window.craftaibSceneGraph = {
        version: 1,
        grids: normalized.map((layer) => layer.grid),
        layers: normalized.map((layer, gridIndex) => ({ id: layer.id, name: layer.name, visible: layer.visible, gridIndex, offset: cloneOffset(layer.offset) })),
        metadata: { sources: normalized.map((layer) => layer.source) },
    };
    window.dispatchEvent(new CustomEvent('craftaib:scene-changed'));
    return window.craftaibSceneGraph;
}

function addSceneLayer(grid, source = 'user', name = '') {
    const layers = getSceneLayers().map((layer) => ({ ...layer, selected: false }));
    const layer = makeLayer(grid, source, name);
    setSceneLayers([...layers, layer]);
    return layer;
}

function removeSceneLayer(layerId) {
    const remaining = getSceneLayers().filter((layer) => layer.id !== layerId);
    if (remaining.length && !remaining.some((layer) => layer.selected)) remaining[0] = { ...remaining[0], selected: true };
    setSceneLayers(remaining);
}

function updateSceneLayer(layerId, patch) {
    const layers = getSceneLayers().map((layer) => layer.id === layerId ? { ...layer, ...patch, offset: patch.offset ? cloneOffset(patch.offset) : cloneOffset(layer.offset) } : layer);
    setSceneLayers(layers);
}

function selectSceneLayer(layerId) {
    setSceneLayers(getSceneLayers().map((layer) => ({ ...layer, selected: layer.id === layerId })));
}

function reorderSceneLayer(layerId, direction) {
    const layers = [...getSceneLayers()];
    const index = layers.findIndex((layer) => layer.id === layerId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= layers.length) return false;
    [layers[index], layers[nextIndex]] = [layers[nextIndex], layers[index]];
    setSceneLayers(layers);
    return true;
}

function clearSceneLayers() {
    setSceneLayers([]);
    window.craftaibImportedGrid = null;
}

function sceneToProjectState() {
    return getSceneLayers().map((layer) => ({ id: layer.id, name: layer.name, source: layer.source, visible: layer.visible, locked: layer.locked, selected: layer.selected, color: layer.color, offset: cloneOffset(layer.offset), grid: layer.grid }));
}

function restoreSceneLayers(layers) {
    if (!Array.isArray(layers)) return false;
    setSceneLayers(layers.filter((layer) => layer?.grid).map((layer, index) => ({ id: String(layer.id || `layer-restored-${index}`), name: String(layer.name || `Layer ${index + 1}`), source: String(layer.source || 'user'), visible: layer.visible !== false, locked: layer.locked === true, selected: layer.selected === true, color: layer.color, offset: cloneOffset(layer.offset), grid: layer.grid })));
    return true;
}

export { addSceneLayer, clearSceneLayers, getSceneLayers, removeSceneLayer, reorderSceneLayer, restoreSceneLayers, sceneToProjectState, selectSceneLayer, setSceneLayers, updateSceneLayer };
