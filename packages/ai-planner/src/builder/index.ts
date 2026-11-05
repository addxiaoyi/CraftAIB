export {
  BUILDERGPT_BLOCK_COUNT,
  BUILDER_BLOCK_NAMES,
  BUILDER_BLOCK_DIRECTORY,
  builderBlockCategory,
  get_minecraft_blocks,
  type BuilderBlockEntry,
} from './block-catalog.js';

export {
  AIR_BLOCK,
  BUILDER_ALLOWED_BLOCKS,
  BUILDER_BLOCK_COUNT,
  normalizeBuilderBlock,
  type BuilderBlockOption,
  type BuilderCell,
  type BuilderOperations,
  type BuilderSpec,
  type ParsedBlock,
} from './spec.js';

export {
  createBuilderRecorder,
  type BuilderOperationHandlers,
  type BuilderRecorder,
  type BlockWrite,
  type RecorderLimits,
} from './recorder.js';

export { BUILDER_RULES, builderBlockList, createBuilderSystemPrompt, type BuilderPromptOptions } from './prompt.js';

export {
  JAVASCRIPT_BUILD_ENTRY,
  MULTI_LANGUAGE_QUERY,
  discoverBuilderBlocks,
  extractBuilderCode,
  parseBuilderSpec,
  perceiveSupportCode,
  type BuildSpecParseError,
  type BuildSpecParseResult,
  type BuilderSupportCode,
} from './spec-parser.js';

export {
  runBuilderScript,
  stepsToCommands,
  type BuilderScriptRun,
  type BuildStep,
  type RunBuilderScriptOptions,
} from './script-runner.js';

export {
  executeBuilderScript,
  type BuilderExecution,
  type BuilderExecutionOptions,
} from './execute.js';

export {
  MAX_MASK_BLOCKS,
  formatBuilderBlock,
  recorderToVoxelMask,
  validateVoxelMask,
  voxelMaskFill,
  voxelMaskToGrid,
  type VoxelMask,
  type VoxelizeOptions,
} from './voxelize.js';

export {
  builderFromReply,
  builderMessages,
  builderRequest,
  type BuilderBuildOptions,
  type BuilderBuildRequest,
  type BuilderBuildResult,
  type BuilderMessage,
  type BuilderModelReply,
  type BuilderModelTransport,
} from './build-entry.js';

export { analyzeBuild, type BuildStats } from './analysis.js';
