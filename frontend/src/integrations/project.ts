import type { CraftAibProject, LitematicaPlacementState, ReferenceReport, StructureData } from '../types/minecraft';
import { isWorkspaceId } from '../layout/workspaces';

type JsonRecord = Record<string, unknown>;
const BLOCK_ID = /^([a-z0-9_.-]+:)?[a-z0-9_./-]+$/;
const STATE_TOKEN = /^[a-z0-9_]+$/;

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as JsonRecord;
}

function text(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string') throw new Error(`${label} must be text.`);
}

function integer(value: unknown, label: string, min = Number.MIN_SAFE_INTEGER): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min) throw new Error(`${label} must be a safe integer${min === 0 ? ' of zero or greater' : min === 1 ? ' greater than zero' : ''}.`);
}

function vector(value: unknown, label: string, min?: number): JsonRecord {
  const point = record(value, label);
  for (const axis of ['x', 'y', 'z']) integer(point[axis], `${label}.${axis}`, min);
  return point;
}

export function validateStructure(value: unknown): StructureData {
  const structure = record(value, 'Structure');
  for (const field of ['id', 'name', 'description', 'author', 'version']) text(structure[field], `Structure ${field}`);
  const size = vector(structure.size, 'Structure size', 1);
  if (!Number.isSafeInteger((size.x as number) * (size.y as number) * (size.z as number))) throw new Error('Structure volume exceeds the safe integer range.');
  if (structure.origin !== undefined) vector(structure.origin, 'Structure origin');
  if (!Array.isArray(structure.blocks)) throw new Error('Structure blocks must be an array.');
  const occupied = new Set<string>();
  for (const value of structure.blocks) {
    const block = vector(value, 'Block position', 0);
    if (['x', 'y', 'z'].some((axis) => (block[axis] as number) >= (size[axis] as number))) throw new Error('A block is outside the structure dimensions.');
    const key = `${block.x},${block.y},${block.z}`;
    if (occupied.has(key)) throw new Error(`Duplicate block at ${key}.`);
    occupied.add(key);
    if (typeof block.blockId !== 'string' || !BLOCK_ID.test(block.blockId)) throw new Error(`Invalid block ID at ${key}.`);
    if (block.state !== undefined) {
      const state = record(block.state, 'Block state');
      for (const [name, property] of Object.entries(state)) {
        if (!STATE_TOKEN.test(name) || typeof property !== 'string' || !STATE_TOKEN.test(property)) throw new Error(`Invalid block state at ${key}.`);
      }
    }
  }
  if (!Array.isArray(structure.regions)) throw new Error('Structure regions must be an array.');
  const ids = new Set<string>();
  for (const value of structure.regions) {
    const region = record(value, 'Region');
    for (const field of ['id', 'name', 'color']) text(region[field], `Region ${field}`);
    if (ids.has(region.id as string)) throw new Error(`Duplicate region ID: ${region.id}.`);
    ids.add(region.id as string);
    if (typeof region.locked !== 'boolean' || typeof region.visible !== 'boolean') throw new Error('Region visibility and lock must be booleans.');
    const bounds = record(region.bounds, 'Region bounds');
    if (!Array.isArray(bounds.min) || !Array.isArray(bounds.max) || bounds.min.length !== 3 || bounds.max.length !== 3) throw new Error('Region bounds must contain three coordinates.');
    for (const [index, axis] of ['x', 'y', 'z'].entries()) {
      const low = bounds.min[index];
      const high = bounds.max[index];
      integer(low, 'Region minimum', 0);
      integer(high, 'Region maximum', 1);
      if (low >= high || high > (size[axis] as number)) throw new Error('Region bounds are outside the structure dimensions.');
    }
  }
  if (structure.createdAt !== undefined) text(structure.createdAt, 'Structure creation date');
  if (structure.metadata !== undefined) {
    const metadata = record(structure.metadata, 'Structure metadata');
    for (const field of ['entities', 'blockEntities', 'pendingBlockTicks']) {
      if (metadata[field] !== undefined && !Array.isArray(metadata[field])) throw new Error(`Metadata ${field} must be an array.`);
    }
  }
  if (structure.plan !== undefined) {
    const plan = record(structure.plan, 'Structure plan');
    if (plan.version !== 1 || !Array.isArray(plan.regions)) throw new Error('Unsupported structure plan.');
    text(plan.name, 'Structure plan name');
    if (plan.notes !== undefined && (!Array.isArray(plan.notes) || plan.notes.some((note) => typeof note !== 'string'))) throw new Error('Plan notes must be text entries.');
    for (const value of plan.regions) {
      const region = record(value, 'Plan region');
      text(region.name, 'Plan region name');
      for (const field of ['x', 'y', 'z']) integer(region[field], `Plan region ${field}`, 0);
      for (const field of ['width', 'height', 'length']) integer(region[field], `Plan region ${field}`, 1);
    }
  }
  return structure as unknown as StructureData;
}

export function validateInventory(value: unknown): Record<string, number> {
  const inventory = record(value, 'Material inventory');
  for (const [id, count] of Object.entries(inventory)) {
    if (!BLOCK_ID.test(id)) throw new Error('Material inventory contains an invalid block ID.');
    integer(count, `Inventory for ${id}`, 0);
  }
  return inventory as Record<string, number>;
}

export function validatePlacements(value: unknown): LitematicaPlacementState[] {
  if (!Array.isArray(value)) throw new Error('Placements must be an array.');
  for (const entry of value) {
    const placement = record(entry, 'Placement');
    text(placement.name, 'Placement name');
    vector(placement.position, 'Placement position');
    if (typeof placement.enabled !== 'boolean' || typeof placement.locked !== 'boolean') throw new Error('Placement visibility and lock must be booleans.');
    if (!['none', 'clockwise_90', '180', 'counter_clockwise_90'].includes(placement.rotation as string)) throw new Error('Invalid placement rotation.');
    if (!['none', 'front_back', 'left_right'].includes(placement.mirror as string)) throw new Error('Invalid placement mirror.');
    for (const field of ['schematic', 'selectedRegion']) if (placement[field] !== undefined) text(placement[field], `Placement ${field}`);
  }
  return value as LitematicaPlacementState[];
}

export function validateHistory(value: unknown): StructureData[] {
  if (!Array.isArray(value)) throw new Error('Edit history must be an array.');
  return value.map(validateStructure);
}

function validateReferenceReport(value: unknown): ReferenceReport {
  const report = record(value, 'Reference report');
  for (const field of ['floors', 'windowColumns', 'towerColumns', 'symmetry', 'sourceWidth', 'sourceHeight', 'silhouetteScore', 'frontScore', 'sideScore', 'roofScore']) {
    if (report[field] !== undefined && (typeof report[field] !== 'number' || !Number.isFinite(report[field]))) throw new Error(`Reference ${field} must be a finite number.`);
  }
  if (report.constructionReview !== undefined) {
    const review = record(report.constructionReview, 'Construction review');
    if (typeof review.accepted !== 'boolean' || !Array.isArray(review.projectionAudits)) throw new Error('Invalid construction review.');
    for (const entry of review.projectionAudits) {
      const audit = record(entry, 'Projection audit');
      text(audit.view, 'Projection view');
      for (const field of ['silhouette', 'missing', 'extra', 'depth']) {
        if (typeof audit[field] !== 'number' || !Number.isFinite(audit[field])) throw new Error(`Projection ${field} must be a finite number.`);
      }
      if (!Array.isArray(audit.issues) || audit.issues.some((issue) => typeof issue !== 'string')) throw new Error('Projection issues must be text entries.');
    }
    for (const field of ['inferredHiddenGeometry', 'requiredRevision']) {
      if (review[field] !== undefined && (!Array.isArray(review[field]) || (review[field] as unknown[]).some((entry) => typeof entry !== 'string'))) throw new Error(`Review ${field} must be text entries.`);
    }
    if (review.interiorAudit !== undefined) {
      const interior = record(review.interiorAudit, 'Interior audit');
      for (const field of ['occupiedVoxels', 'volume', 'lights', 'connectedComponents', 'supports', 'openings']) integer(interior[field], `Interior ${field}`, 0);
    }
  }
  if (report.subjectBounds !== undefined) {
    const bounds = record(report.subjectBounds, 'Reference bounds');
    for (const edge of ['left', 'top', 'right', 'bottom']) {
      if (typeof bounds[edge] !== 'number' || !Number.isFinite(bounds[edge])) throw new Error('Reference bounds must contain finite numbers.');
    }
  }
  return report as unknown as ReferenceReport;
}

export function validateAiMetadata(value: unknown): NonNullable<CraftAibProject['ai']> {
  const ai = record(value, 'AI settings');
  text(ai.prompt, 'AI prompt');
  if (ai.referenceImage !== undefined) text(ai.referenceImage, 'Reference image');
  if (ai.source !== undefined && ai.source !== 'ai' && ai.source !== 'local') throw new Error('Invalid generation source.');
  if (ai.referenceReport !== undefined) validateReferenceReport(ai.referenceReport);
  return ai as NonNullable<CraftAibProject['ai']>;
}

export function validateProject(value: unknown): CraftAibProject {
  const project = record(value, 'Project');
  if (project.version !== 1) throw new Error('Unsupported CraftAIB project version.');
  validateStructure(project.structure);
  if (project.activeWorkspace !== undefined && (typeof project.activeWorkspace !== 'string' || !isWorkspaceId(project.activeWorkspace))) throw new Error('Unknown project workspace.');
  if (project.language !== undefined && project.language !== 'zh' && project.language !== 'en') throw new Error('Invalid project language.');
  if (project.autoSave !== undefined && typeof project.autoSave !== 'boolean') throw new Error('Project autosave must be a boolean.');
  if (project.ai !== undefined) validateAiMetadata(project.ai);
  if (project.history !== undefined) validateHistory(project.history);
  if (project.placements !== undefined) validatePlacements(project.placements);
  if (project.materialInventory !== undefined) validateInventory(project.materialInventory);
  if (project.savedAt !== undefined) text(project.savedAt, 'Project save date');
  return project as unknown as CraftAibProject;
}

export { stringifyEngineJson as stringifyProjectJson, parseEngineJson as parseProjectJson } from '../../../packages/core/src/json';
