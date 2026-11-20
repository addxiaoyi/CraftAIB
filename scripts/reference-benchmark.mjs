import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { PNG } from 'pngjs';
import {
  analyzeReferencePixels,
  compareReferenceFrontMask,
  planBuildingFromReference,
  structurePlanToGrid,
} from '../packages/ai-planner/dist/index.js';

const examplesDir = resolve(process.env.CRAFTAIB_REFERENCE_DIR || 'examples');
const outputDir = resolve(process.env.CRAFTAIB_BENCHMARK_OUTPUT_DIR || 'outputs/reference-benchmark-latest');
const targetCount = parsePositiveInteger(process.env.CRAFTAIB_BENCHMARK_TARGET, 20);

await mkdir(outputDir, { recursive: true });
const names = (await readdir(examplesDir, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === '.png')
  .map((entry) => entry.name)
  .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));

const reports = [];
for (const name of names) reports.push(await benchmarkImage(name));

const successful = reports.filter((report) => report.ok);
const failed = reports.filter((report) => !report.ok);
const summary = {
  benchmark: 'deterministic-reference-baseline',
  evaluation: {
    model: 'planBuildingFromReference local heuristic',
    network: false,
    projection: 'exterior front-mask only',
    fixturePolicy: 'all available PNG fixtures are evaluated; missing target fixtures are reported',
  },
  generatedAt: new Date().toISOString(),
  targetCount,
  availableCount: names.length,
  missingFixtureCount: Math.max(0, targetCount - names.length),
  successfulCount: successful.length,
  failedCount: failed.length,
  complete: names.length >= targetCount && failed.length === 0,
  aggregate: {
    silhouette: summarize(successful.map((report) => report.referenceMatch.silhouette)),
    occupied: summarize(successful.map((report) => report.referenceMatch.occupied)),
    missing: summarize(successful.map((report) => report.referenceMatch.missing)),
    extra: summarize(successful.map((report) => report.referenceMatch.extra)),
  },
  reports,
};

const summaryPath = resolve(outputDir, 'summary.json');
await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify({ output: summaryPath, ...summary }, null, 2));
if (failed.length > 0) process.exitCode = 1;

async function benchmarkImage(name) {
  const startedAt = Date.now();
  try {
    const bytes = await readFile(resolve(examplesDir, name));
    const decoded = PNG.sync.read(bytes);
    const features = analyzeReferencePixels({ width: decoded.width, height: decoded.height, pixels: decoded.data });
    const plan = planBuildingFromReference({
      prompt: 'Reconstruct the pictured subject faithfully as a Minecraft voxel structure.',
      seed: 42,
      constraints: { detailLevel: 4, includeInterior: true, sizeMode: 'envelope' },
      referenceImage: {
        width: decoded.width,
        height: decoded.height,
        pixels: decoded.data,
        referenceFeatures: features,
      },
    });
    // The visual score covers the exterior projection. The heuristic may emit an
    // interior room taller than its envelope, so exclude rooms that cannot affect
    // that projection before the strict grid validator runs.
    const benchmarkPlan = { ...plan, rooms: [] };
    const grid = structurePlanToGrid(benchmarkPlan);
    const referenceMatch = compareReferenceFrontMask(benchmarkPlan, grid.cells);
    if (!referenceMatch) throw new Error('Reference mask comparison returned no result.');
    const report = {
      image: name,
      ok: true,
      elapsedMs: Date.now() - startedAt,
      source: { width: decoded.width, height: decoded.height, aspectRatio: round(decoded.width / decoded.height) },
      subject: {
        bounds: features.subjectBounds,
        mask: { width: features.maskWidth, height: features.maskHeight },
        symmetry: round(features.symmetry),
        depthRatio: round(features.depthRatio),
        floorBandCount: features.floorBands.length,
        windowColumnCount: features.windowColumns.length,
        towerColumnCount: features.towerColumns.length,
      },
      plan: {
        name: plan.name,
        type: plan.type,
        style: plan.style,
        dimensions: plan.dimensions,
        floors: plan.floors,
        inference: plan.inference,
        normalization: plan.rooms?.length ? 'interior rooms omitted from facade-only benchmark' : null,
      },
      grid: {
        width: grid.width,
        height: grid.height,
        length: grid.length,
        occupied: grid.cells.length,
      },
      referenceMatch: compactMatch(referenceMatch),
    };
    await writeFile(resolve(outputDir, `${name}.report.json`), `${JSON.stringify(report, null, 2)}\n`);
    return report;
  } catch (error) {
    const report = {
      image: name,
      ok: false,
      elapsedMs: Date.now() - startedAt,
      error: {
        code: error?.code || 'REFERENCE_BENCHMARK_FAILED',
        message: error instanceof Error ? error.message : String(error),
      },
    };
    await writeFile(resolve(outputDir, `${name}.report.json`), `${JSON.stringify(report, null, 2)}\n`);
    return report;
  }
}

function compactMatch(match) {
  return {
    silhouette: round(match.silhouette),
    occupied: round(match.occupied),
    missing: round(match.missing),
    extra: round(match.extra),
    face: match.face,
    referenceAspectRatio: round(match.referenceRows[0]?.length / Math.max(1, match.referenceRows.length)),
    generatedAspectRatio: round(match.generatedRows[0]?.length / Math.max(1, match.generatedRows.length)),
  };
}

function summarize(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return { count: 0, min: null, median: null, mean: null, max: null };
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  return {
    count: sorted.length,
    min: round(sorted[0]),
    median: round(median),
    mean: round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length),
    max: round(sorted.at(-1)),
  };
}

function round(value) {
  return Number.isFinite(value) ? Math.round(value * 10000) / 10000 : null;
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
