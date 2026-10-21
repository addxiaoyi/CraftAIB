import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { StructureData, VoxelBlock } from '../types/minecraft';
import { BLOCK_REGISTRY } from '../utils/blockRegistry';
import { RotateCcw, Maximize2, Minimize2 } from 'lucide-react';

const MINECRAFT_TEXTURE_BASE = 'https://assets.mcasset.cloud/1.21.4/assets/minecraft/textures/block/';
const MAX_PREVIEW_BLOCKS = 240_000;

function textureUrlForBlock(blockId: string): string {
  const name = blockId.replace(/^minecraft:/, '');
  const aliases: Record<string, string> = {
    dark_oak_door: 'dark_oak_door_bottom',
    iron_door: 'iron_door_bottom',
    grass_block: 'grass_block_side',
    dirt_path: 'dirt_path_side',
    glass_pane: 'glass_pane_top',
    barrel: 'barrel_side',
    furnace: 'furnace_side',
    stone_brick_stairs: 'stone_bricks',
    dark_oak_stairs: 'dark_oak_planks',
    oak_stairs: 'oak_planks',
    stone_brick_slab: 'stone_bricks',
    dark_oak_slab: 'dark_oak_planks',
    oak_slab: 'oak_planks',
    red_bed: 'red_wool',
    white_bed: 'white_wool',
    orange_bed: 'orange_wool',
    yellow_bed: 'yellow_wool',
    lime_bed: 'lime_wool',
    green_bed: 'green_wool',
    cyan_bed: 'cyan_wool',
    light_blue_bed: 'light_blue_wool',
    blue_bed: 'blue_wool',
    purple_bed: 'purple_wool',
    magenta_bed: 'magenta_wool',
    pink_bed: 'pink_wool',
    brown_bed: 'brown_wool',
    gray_bed: 'gray_wool',
    light_gray_bed: 'light_gray_wool',
    black_bed: 'black_wool',
  };
  const textureName = aliases[name] ?? (name.endsWith('_bed') ? `${name.slice(0, -4)}_wool` : name);
  return `${MINECRAFT_TEXTURE_BASE}${textureName}.png`;
}

function focusForStructure(structure: StructureData): { center: THREE.Vector3; size: number } {
  if (!structure.blocks.length) {
    return {
      center: new THREE.Vector3(structure.size.x / 2, structure.size.y / 2, structure.size.z / 2),
      size: Math.max(structure.size.x, structure.size.y, structure.size.z, 16),
    };
  }
  const bounds = structure.blocks.reduce((acc, block) => ({
    minX: Math.min(acc.minX, block.x), maxX: Math.max(acc.maxX, block.x),
    minY: Math.min(acc.minY, block.y), maxY: Math.max(acc.maxY, block.y),
    minZ: Math.min(acc.minZ, block.z), maxZ: Math.max(acc.maxZ, block.z),
  }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity });
  return {
    center: new THREE.Vector3((bounds.minX + bounds.maxX + 1) / 2, (bounds.minY + bounds.maxY + 1) / 2, (bounds.minZ + bounds.maxZ + 1) / 2),
    size: Math.max(bounds.maxX - bounds.minX + 1, bounds.maxY - bounds.minY + 1, bounds.maxZ - bounds.minZ + 1, 16),
  };
}
interface ThreeViewportProps {
  structure: StructureData;
  activeRegionId?: string | null;
  onSelectBlock?: (block: VoxelBlock | null) => void;
  minY?: number;
  maxY?: number;
  showRegions?: boolean;
  wireframe?: boolean;
  showGrid?: boolean;
  className?: string;
  onToggleFullscreen?: () => void;
  isFullscreen?: boolean;
}

export const ThreeViewport: React.FC<ThreeViewportProps> = ({
  structure,
  activeRegionId,
  onSelectBlock,
  minY = 0,
  maxY = 64,
  showRegions = true,
  wireframe = false,
  showGrid = true,
  className = '',
  onToggleFullscreen,
  isFullscreen = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const instancedMeshesRef = useRef<THREE.InstancedMesh[]>([]);
  const boundingBoxesGroupRef = useRef<THREE.Group | null>(null);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);

  // Smooth camera tweening ref
  const cameraTweenRef = useRef<{
    startTime: number;
    duration: number;
    startPos: THREE.Vector3;
    targetPos: THREE.Vector3;
    startTarget: THREE.Vector3;
    targetTarget: THREE.Vector3;
    active: boolean;
  } | null>(null);

  const [hoveredBlock, setHoveredBlock] = useState<VoxelBlock | null>(null);
  const [fps, setFps] = useState<number>(60);
  const [activeCameraView, setActiveCameraView] = useState<'iso' | 'top' | 'front' | 'side'>('iso');

  const visibleBlocks = useMemo(() => {
    return structure.blocks.filter((b: VoxelBlock) => {
      if (b.y < minY || b.y > maxY) return false;

      if (structure.regions && structure.regions.length > 0) {
        let insideAnyRegion = false;
        let insideVisibleRegion = false;

        for (const reg of structure.regions) {
          const [minX, rMinY, minZ] = reg.bounds.min;
          const [maxX, rMaxY, maxZ] = reg.bounds.max;

          if (
            b.x >= minX &&
            b.x < maxX &&
            b.y >= rMinY &&
            b.y < rMaxY &&
            b.z >= minZ &&
            b.z < maxZ
          ) {
            insideAnyRegion = true;
            if (reg.visible) {
              insideVisibleRegion = true;
            }
          }
        }

        if (insideAnyRegion && !insideVisibleRegion) return false;
      }

      return true;
    });
  }, [structure, minY, maxY]);

  const previewBlocks = useMemo(() => {
    if (visibleBlocks.length <= MAX_PREVIEW_BLOCKS) return visibleBlocks;
    const priority = visibleBlocks.filter((block) => /stairs|door|lantern|glass|torch|bed|chest|table|bookshelf|furnace|anvil|bell|scaffolding/i.test(block.blockId));
    const stride = Math.max(1, Math.ceil(visibleBlocks.length / Math.max(1, MAX_PREVIEW_BLOCKS - priority.length)));
    const sampled = visibleBlocks.filter((_, index) => index % stride === 0);
    const seen = new Set(sampled.map((block) => `${block.x},${block.y},${block.z}`));
    for (const block of priority) {
      if (seen.size >= MAX_PREVIEW_BLOCKS) break;
      const key = `${block.x},${block.y},${block.z}`;
      if (!seen.has(key)) {
        sampled.push(block);
        seen.add(key);
      }
    }
    return sampled.slice(0, MAX_PREVIEW_BLOCKS);
  }, [visibleBlocks]);

  const colorForBlock = (blockId: string): string => {
    const registered = BLOCK_REGISTRY[blockId];
    if (registered) return registered.color;
    if (/obsidian|blackstone|netherite/.test(blockId)) return '#292333';
    if (/deepslate/.test(blockId)) return '#45454a';
    if (/quartz|calcite|diorite|white_concrete/.test(blockId)) return '#d4d1c9';
    if (/glass|ice/.test(blockId)) return '#74b7c7';
    if (/copper|prismarine/.test(blockId)) return '#579d8d';
    if (/oak|spruce|birch|jungle|acacia|mangrove|cherry|planks|log/.test(blockId)) return '#8d6842';
    if (/redstone/.test(blockId)) return '#a94238';
    if (/black_concrete|coal/.test(blockId)) return '#292a2e';
    if (/stone|andesite|granite|tuff|cobble/.test(blockId)) return '#77736c';
    return '#888888';
  };

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 500;

    const focus = focusForStructure(structure);
    const maxDim = focus.size;
    const fogDensity = maxDim > 128 ? 0.0009 : 0.006;

    // Keep large structures visible across the full schematic envelope.
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#090a0f');
    scene.fog = maxDim > 128 ? null : new THREE.FogExp2('#090a0f', fogDensity);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, Math.max(1200, maxDim * 6));
    camera.position.set(focus.center.x + maxDim * 1.6, focus.center.y + maxDim * 1.35, focus.center.z + maxDim * 1.8);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;

    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05; // Buttery smooth inertial drag
    controls.target.copy(focus.center);
    controls.maxDistance = Math.max(320, maxDim * 6);
    controls.minDistance = 2;
    controlsRef.current = controls;

    // Architectural Studio Lighting
    const ambientLight = new THREE.AmbientLight('#ffffff', 0.88);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight('#fffcf5', 1.85);
    keyLight.position.set(focus.center.x + maxDim * 2.2, focus.center.y + maxDim * 3.2, focus.center.z + maxDim * 2.2);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight('#a1a1aa', 0.48);
    fillLight.position.set(focus.center.x - maxDim * 2, focus.center.y + maxDim * 1.5, focus.center.z - maxDim);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight('#10b981', 0.28);
    rimLight.position.set(focus.center.x, focus.center.y - maxDim, focus.center.z + maxDim * 2.5);
    scene.add(rimLight);

    // Ground Grid with delicate subdivisions
    const gridSize = Math.max(32, Math.ceil(maxDim / 16) * 16 * 2);
    const gridHelper = new THREE.GridHelper(gridSize, gridSize, '#27272a', '#18181b');
    gridHelper.position.set(structure.size.x / 2, -0.01, structure.size.z / 2);
    scene.add(gridHelper);
    gridHelperRef.current = gridHelper;

    const boxGroup = new THREE.Group();
    scene.add(boxGroup);
    boundingBoxesGroupRef.current = boxGroup;

    let lastTime = performance.now();
    let frameCount = 0;
    let animId: number;

    const animate = (time: number) => {
      animId = requestAnimationFrame(animate);

      // Handle silky camera tweening animation
      if (cameraTweenRef.current && cameraTweenRef.current.active) {
        const tween = cameraTweenRef.current;
        const elapsed = time - tween.startTime;
        const progress = Math.min(1, elapsed / tween.duration);

        // Smooth cubic-bezier easeOut curve
        const ease = 1 - Math.pow(1 - progress, 3);

        camera.position.lerpVectors(tween.startPos, tween.targetPos, ease);
        controls.target.lerpVectors(tween.startTarget, tween.targetTarget, ease);

        if (progress >= 1) {
          tween.active = false;
        }
      }

      controls.update();
      renderer.render(scene, camera);

      frameCount++;
      if (time - lastTime >= 1000) {
        setFps(Math.round((frameCount * 1000) / (time - lastTime)));
        frameCount = 0;
        lastTime = time;
      }
    };
    animId = requestAnimationFrame(animate);

    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const nw = container.clientWidth;
      const nh = container.clientHeight;
      if (nw === 0 || nh === 0) return;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      renderer.dispose();
      controls.dispose();
    };
  }, []);

  useEffect(() => {
    if (gridHelperRef.current) {
      gridHelperRef.current.visible = showGrid;
    }
  }, [showGrid]);

  useEffect(() => {
    if (!boundingBoxesGroupRef.current || !sceneRef.current) return;
    const group = boundingBoxesGroupRef.current;

    while (group.children.length > 0) {
      const child = group.children[0] as THREE.LineSegments;
      if (child.geometry) child.geometry.dispose();
      group.remove(child);
    }

    if (!showRegions || !structure.regions) return;

    for (const region of structure.regions) {
      if (!region.visible) continue;
      const [minX, rMinY, minZ] = region.bounds.min;
      const [maxX, rMaxY, maxZ] = region.bounds.max;

      const sizeX = Math.max(1, maxX - minX);
      const sizeY = Math.max(1, rMaxY - rMinY);
      const sizeZ = Math.max(1, maxZ - minZ);

      const boxGeo = new THREE.BoxGeometry(sizeX, sizeY, sizeZ);
      const wireGeo = new THREE.WireframeGeometry(boxGeo);
      const isSelected = activeRegionId === region.id;

      const wireMat = new THREE.LineBasicMaterial({
        color: isSelected ? '#10b981' : region.color || '#3b82f6',
        linewidth: isSelected ? 2 : 1,
        transparent: true,
        opacity: isSelected ? 0.95 : 0.35,
      });

      const wireframeBox = new THREE.LineSegments(wireGeo, wireMat);
      wireframeBox.position.set(
        minX + sizeX / 2,
        rMinY + sizeY / 2,
        minZ + sizeZ / 2
      );
      group.add(wireframeBox);
    }
  }, [structure.regions, activeRegionId, showRegions]);

  useEffect(() => {
    if (!sceneRef.current) return;
    const scene = sceneRef.current;
    let cancelled = false;

    const sharedGeometry = instancedMeshesRef.current[0]?.geometry;
    instancedMeshesRef.current.forEach((mesh) => {
      scene.remove(mesh);
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m: THREE.Material) => m.dispose());
      } else {
        mesh.material.dispose();
      }
    });
    sharedGeometry?.dispose();
    instancedMeshesRef.current = [];

    const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
    const dummy = new THREE.Object3D();

    const renderBlocks = async () => {
      const groups = new Map<string, VoxelBlock[]>();
      for (const block of previewBlocks) {
        const url = textureUrlForBlock(block.blockId);
        const group = groups.get(url);
        if (group) group.push(block);
        else groups.set(url, [block]);
      }
      const loader = new THREE.TextureLoader();
      const loaded = await Promise.all([...groups.entries()].map(async ([url, blocks]) => {
        try {
          const texture = await loader.loadAsync(url);
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.magFilter = THREE.NearestFilter;
          texture.minFilter = THREE.NearestFilter;
          texture.generateMipmaps = false;
          return { url, blocks, texture };
        } catch {
          return { url, blocks, texture: null };
        }
      }));
      if (cancelled) {
        loaded.forEach(({ texture }) => texture?.dispose());
        return;
      }
      loaded.forEach(({ url, blocks, texture }) => {
        const material = new THREE.MeshStandardMaterial({
          color: new THREE.Color(colorForBlock(blocks[0]?.blockId ?? '')),
          ...(texture ? { map: texture } : {}),
          roughness: 0.78,
          metalness: 0.04,
          wireframe,
        });
        const instancedMesh = new THREE.InstancedMesh(boxGeometry, material, blocks.length);
        instancedMesh.frustumCulled = true;
        instancedMesh.castShadow = true;
        instancedMesh.receiveShadow = true;
        blocks.forEach((block, index) => {
          dummy.position.set(block.x + 0.5, block.y + 0.5, block.z + 0.5);
          dummy.updateMatrix();
          instancedMesh.setMatrixAt(index, dummy.matrix);
        });
        instancedMesh.instanceMatrix.needsUpdate = true;
        (instancedMesh as any).userData = { blocks, textureUrl: url };
        scene.add(instancedMesh);
        instancedMeshesRef.current.push(instancedMesh);
      });
    };
    void renderBlocks();
    return () => {
      cancelled = true;
    };
  }, [previewBlocks, wireframe]);

  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const mouse = useMemo(() => new THREE.Vector2(), []);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!containerRef.current || !cameraRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, cameraRef.current);
    const intersects = raycaster.intersectObjects(instancedMeshesRef.current, false);

    if (intersects.length > 0) {
      const hit = intersects[0];
      const instanceId = hit.instanceId;
      if (instanceId !== undefined && hit.object) {
        const meshBlocks = (hit.object as any).userData?.blocks as VoxelBlock[];
        if (meshBlocks && meshBlocks[instanceId]) {
          setHoveredBlock(meshBlocks[instanceId]);
          return;
        }
      }
    }
    setHoveredBlock(null);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (hoveredBlock && onSelectBlock) {
      onSelectBlock(hoveredBlock);
    }
  };

  // Silky smooth camera tweening
  const setCameraPreset = useCallback(
    (view: 'iso' | 'top' | 'front' | 'side' | 'reset') => {
      if (!cameraRef.current || !controlsRef.current) return;
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      const focus = focusForStructure(structure);
      const cx = focus.center.x;
      const cy = focus.center.y;
      const cz = focus.center.z;
      const maxDim = focus.size;

      const targetLookAt = new THREE.Vector3(cx, cy, cz);
      const targetPos = new THREE.Vector3();

      if (view === 'iso' || view === 'reset') {
        targetPos.set(cx + maxDim * 1.5, cy + maxDim * 1.25, cz + maxDim * 1.5);
        setActiveCameraView('iso');
      } else if (view === 'top') {
        targetPos.set(cx, cy + maxDim * 2.2, cz + 0.01);
        setActiveCameraView('top');
      } else if (view === 'front') {
        targetPos.set(cx, cy, cz + maxDim * 2.1);
        setActiveCameraView('front');
      } else if (view === 'side') {
        targetPos.set(cx + maxDim * 2.1, cy, cz);
        setActiveCameraView('side');
      }

      // Trigger silky 400ms camera lerp animation
      cameraTweenRef.current = {
        startTime: performance.now(),
        duration: 400,
        startPos: camera.position.clone(),
        targetPos: targetPos,
        startTarget: controls.target.clone(),
        targetTarget: targetLookAt,
        active: true,
      };
    },
    [structure]
  );

  return (
    <div
      className={`relative w-full h-full min-h-[360px] md:min-h-[420px] bg-[#090a0f] overflow-hidden select-none touch-none ${className}`}
      onPointerMove={handlePointerMove}
      onPointerDown={handlePointerDown}
    >
      {/* 3D WebGL Canvas */}
      <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* CAD Viewfinder Technical Corner Reticles */}
      <div className="absolute top-2.5 left-2.5 w-3 h-3 border-t-1.5 border-l-1.5 border-white/20 pointer-events-none z-10" />
      <div className="absolute top-2.5 right-2.5 w-3 h-3 border-t-1.5 border-r-1.5 border-white/20 pointer-events-none z-10" />
      <div className="absolute bottom-2.5 left-2.5 w-3 h-3 border-b-1.5 border-l-1.5 border-white/20 pointer-events-none z-10" />
      <div className="absolute bottom-2.5 right-2.5 w-3 h-3 border-b-1.5 border-r-1.5 border-white/20 pointer-events-none z-10" />

      {/* Floating HUD: Technical Metadata (Responsive) */}
      <div className="absolute top-3 left-3 flex items-center gap-2 studio-glass px-2.5 py-1.5 md:px-3 md:py-1.5 rounded-lg text-[11px] md:text-xs text-zinc-300 shadow-xl transition-all z-10">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
        <span className="font-mono text-emerald-400 font-semibold tabular-nums">
          {visibleBlocks.length.toLocaleString()}
        </span>
        <span className="text-zinc-500 hidden sm:inline">voxels</span>
        <span className="text-zinc-700 hidden sm:inline">/</span>
        <span className="font-mono text-zinc-400 tabular-nums hidden sm:inline">{fps} FPS</span>
        <span className="text-zinc-700">/</span>
        {previewBlocks.length < visibleBlocks.length && <span className="font-mono text-amber-300 tabular-nums hidden sm:inline">preview {previewBlocks.length.toLocaleString()}</span>}
        {previewBlocks.length < visibleBlocks.length && <span className="text-zinc-700">/</span>}
        <span className="font-mono text-zinc-300 tabular-nums font-semibold">
          {structure.size.x}×{structure.size.y}×{structure.size.z}
        </span>
      </div>

      {/* Floating Camera Viewport Control HUD (Responsive) */}
      <div className="absolute top-3 right-3 flex items-center gap-1 studio-glass p-1 rounded-lg text-xs shadow-xl transition-all z-10">
        {(['iso', 'top', 'front', 'side'] as const).map((view) => (
          <button
            key={view}
            onClick={() => setCameraPreset(view)}
            className={`px-2 py-1 rounded text-[10px] sm:text-[11px] font-mono uppercase transition-all duration-150 cursor-pointer ${
              activeCameraView === view
                ? 'bg-white text-zinc-950 font-bold shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.06]'
            }`}
          >
            {view}
          </button>
        ))}
        <div className="w-[1px] h-3 bg-white/10 mx-0.5" />
        <button
          onClick={() => setCameraPreset('reset')}
          className="p-1 rounded text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
          title="Reset Camera View"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
        {onToggleFullscreen && (
          <button
            onClick={onToggleFullscreen}
            className="p-1 rounded text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors ml-0.5 cursor-pointer"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Viewport'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5 text-emerald-400" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      {/* Floating Voxel Property Card */}
      {hoveredBlock && (
        <div className="absolute bottom-3 left-3 studio-glass px-3 py-2 rounded-lg flex items-center gap-2.5 pointer-events-none border border-emerald-500/30 animate-fade-in shadow-2xl max-w-[calc(100%-24px)] z-10">
          <div
            className="w-3.5 h-3.5 rounded-sm border border-white/20 shrink-0 shadow-sm"
            style={{
              backgroundColor: BLOCK_REGISTRY[hoveredBlock.blockId]?.color || '#71717a',
            }}
          />
          <div className="truncate">
            <div className="text-xs font-semibold text-white leading-tight truncate">
              {BLOCK_REGISTRY[hoveredBlock.blockId]?.name || hoveredBlock.blockId}
            </div>
            <div className="text-[11px] font-mono text-emerald-400 tabular-nums">
              X: {hoveredBlock.x} · Y: {hoveredBlock.y} · Z: {hoveredBlock.z}
            </div>
          </div>
        </div>
      )}

      {/* Layer Height Indicator (Responsive) */}
      <div className="absolute bottom-3 right-3 text-[10px] sm:text-[11px] font-mono text-zinc-400 studio-glass px-2.5 py-1 rounded-lg tabular-nums shadow-lg z-10">
        Y {minY}–{maxY} <span className="text-zinc-600">/</span> {structure.size.y - 1}
      </div>
    </div>
  );
};
