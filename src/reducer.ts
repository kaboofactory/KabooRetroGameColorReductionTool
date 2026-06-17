import type {
  FamicomAnalysis,
  FamicomAttributeCell,
  FamicomBgTileColorStats,
  FamicomConvergenceStep,
  FamicomPaletteUsageEntry,
  FamicomSpriteCandidate,
  FamicomSubPalette,
  FamicomTilePaletteSheet,
  QuantizationMode,
  RegionOfInterest
} from "./types";

const FAMICOM_PREVIEW_PALETTE: ReadonlyArray<readonly [number, number, number]> = [
  [124, 124, 124], [0, 0, 252], [0, 0, 188], [68, 40, 188],
  [148, 0, 132], [168, 0, 32], [168, 16, 0], [136, 20, 0],
  [80, 48, 0], [0, 120, 0], [0, 104, 0], [0, 88, 0],
  [0, 64, 88], [0, 0, 0], [0, 0, 0], [0, 0, 0],
  [188, 188, 188], [0, 120, 248], [0, 88, 248], [104, 68, 252],
  [216, 0, 204], [228, 0, 88], [248, 56, 0], [228, 92, 16],
  [172, 124, 0], [0, 184, 0], [0, 168, 0], [0, 168, 68],
  [0, 136, 136], [0, 0, 0], [0, 0, 0], [0, 0, 0],
  [248, 248, 248], [60, 188, 252], [104, 136, 252], [152, 120, 248],
  [248, 120, 248], [248, 88, 152], [248, 120, 88], [252, 160, 68],
  [248, 184, 0], [184, 248, 24], [88, 216, 84], [88, 248, 152],
  [0, 232, 216], [120, 120, 120], [0, 0, 0], [0, 0, 0],
  [252, 252, 252], [164, 228, 252], [184, 184, 248], [216, 184, 248],
  [248, 184, 248], [248, 164, 192], [240, 208, 176], [252, 224, 168],
  [248, 216, 120], [216, 248, 120], [184, 248, 184], [184, 248, 216],
  [0, 252, 252], [248, 216, 248], [0, 0, 0], [0, 0, 0]
];

const FORBIDDEN_COLOR_INDEX = 0x0d;
const DEFAULT_BACKGROUND_COLOR = 0x0f;
const ATTRIBUTE_SIZE = 16;
const TILE_SIZE = 8;
const BG_SUB_PALETTE_COUNT = 4;
const SUB_PALETTE_COLOR_COUNT = 3;
const SCANLINE_SPRITE_LIMIT = 8;
const BG_PALETTE_REFINEMENT_PASSES = 3;
const SPRITE_PALETTE_REFINEMENT_PASSES = 2;
const FAMICOM_PATTERN_TABLE_TILE_LIMIT = 256;
const TILE_SHEET_COLUMNS = 16;
const BG_TILE_MERGE_THRESHOLD_STEPS = [0, 8, 16, 24, 32, 40, 56] as const;
const SPRITE_TILE_MERGE_THRESHOLD_STEPS = [0, 6, 12, 18, 24, 32, 40] as const;
const MAX_CONVERGENCE_ITERATIONS = 24;
const UNUSED_PREVIEW_PIXEL: readonly [number, number, number] = [255, 0, 200];
const EXCLUDED_EFFECTIVE_FAMICOM_COLOR_INDICES = new Set<number>([0x20, 0x2d, 0x3d]);
const EFFECTIVE_FAMICOM_PALETTE_INDICES = buildEffectiveFamicomPaletteIndices();
const LOW_BG_PALETTE_USAGE_CELL_THRESHOLD = 2;
const LOW_BG_PALETTE_RESEED_MAX_PASSES = 3;

interface FamicomReductionResult {
  finalCanvas: HTMLCanvasElement;
  bgCanvas: HTMLCanvasElement;
  spriteCanvas: HTMLCanvasElement;
  analysis: FamicomAnalysis;
}

interface IndexedImage {
  width: number;
  height: number;
  pixels: Uint8Array;
}

interface ReductionOptions {
  brightness: number;
  contrast: number;
  saturation: number;
  quantizationMode: QuantizationMode;
  glitchPreviewEnabled: boolean;
}

interface CellAnalysis {
  cellX: number;
  cellY: number;
  frequencyMap: Map<number, number>;
  weightedFrequencyMap: Map<number, number>;
  topColors: number[];
  overlapsRoi: boolean;
}

interface BgAssignmentResult {
  attributeCells: FamicomAttributeCell[];
  allowedByCell: Map<string, FamicomAttributeCell>;
}

interface RenderedPreview {
  finalCanvas: HTMLCanvasElement;
  bgCanvas: HTMLCanvasElement;
  spriteCanvas: HTMLCanvasElement;
  spriteSubPalettes: [FamicomSubPalette, FamicomSubPalette, FamicomSubPalette, FamicomSubPalette];
  spriteCandidates: FamicomSpriteCandidate[];
  scanlineOverflowCount: number;
  acceptedSpriteTiles: Array<{ tileX: number; tileY: number }>;
  rejectedSpriteTiles: Array<{ tileX: number; tileY: number }>;
  uniqueBgTileCount: number;
  totalBgTileCount: number;
  uniqueSpriteTileCount: number;
  totalSpriteTileCount: number;
  bgTileColorStats: FamicomBgTileColorStats;
  bgPaletteUsage: FamicomPaletteUsageEntry[][];
  spritePaletteUsage: FamicomPaletteUsageEntry[][];
  unresolvedAttributeCellCount: number;
  unresolvedPixelCount: number;
  convergenceIterations: number;
  convergenceHistory: FamicomConvergenceStep[];
  bgTilePaletteSheet: FamicomTilePaletteSheet;
  spriteTilePaletteSheet: FamicomTilePaletteSheet;
  hardwareStatus: "ok" | "warning";
  hardwareFindings: string[];
}

interface SpriteTileCandidate {
  tileX: number;
  tileY: number;
  pixelCount: number;
  overlapsRoi: boolean;
}

interface SpriteSelectionResult {
  selectedTiles: Map<string, SpriteTileCandidate>;
  rejectedTiles: Map<string, SpriteTileCandidate>;
  scanlineOverflowCount: number;
}

interface SpriteTileAnalysis {
  tileX: number;
  tileY: number;
  weightedFrequencyMap: Map<number, number>;
  topColors: number[];
}

interface SpriteClusterAnalysis {
  key: string;
  colors: number[];
  weightedFrequencyMap: Map<number, number>;
  tileKeys: string[];
}

interface ReductionTuning {
  bgMergeStepIndex: number;
  spriteMergeStepIndex: number;
  roiBgColorCapacity: 2 | 3;
  enableRoiSpriteForce: boolean;
  allowRoiSpriteCandidateRemoval: boolean;
}

interface ReductionViolations {
  bgTileOverflow: number;
  spriteTileOverflow: number;
  unresolvedCellCount: number;
  rejectedSpriteCount: number;
  scanlineOverflowCount: number;
}

/** ファミコン向けの通し減色を実行するにゃ。 */
export function reduceFamicomImage(
  sourceCanvas: HTMLCanvasElement,
  roi: RegionOfInterest | null,
  roiEnabled: boolean,
  options: ReductionOptions
): FamicomReductionResult {
  const weightedRoi = roi && roiEnabled && roi.enabled ? roi : null;
  const indexedImage = quantizeCanvasToFamicomPalette(sourceCanvas, options);
  const bgAnalysis = analyzeFamicomBackground(indexedImage, weightedRoi);
  const renderedPreview = convergeFamicomPreview(
    indexedImage,
    bgAnalysis.universalColor,
    bgAnalysis.bgSubPalettes,
    bgAnalysis.assignment,
    weightedRoi,
    options.glitchPreviewEnabled
  );

  return {
    finalCanvas: renderedPreview.finalCanvas,
    bgCanvas: renderedPreview.bgCanvas,
    spriteCanvas: renderedPreview.spriteCanvas,
    analysis: {
      universalColor: bgAnalysis.universalColor,
      bgSubPalettes: bgAnalysis.bgSubPalettes,
      spriteSubPalettes: renderedPreview.spriteSubPalettes,
      attributeCells: bgAnalysis.assignment.attributeCells,
      spriteCandidates: renderedPreview.spriteCandidates,
      scanlineOverflowCount: renderedPreview.scanlineOverflowCount,
      acceptedSpriteTiles: renderedPreview.acceptedSpriteTiles,
      rejectedSpriteTiles: renderedPreview.rejectedSpriteTiles,
      uniqueBgTileCount: renderedPreview.uniqueBgTileCount,
      totalBgTileCount: renderedPreview.totalBgTileCount,
      uniqueSpriteTileCount: renderedPreview.uniqueSpriteTileCount,
      totalSpriteTileCount: renderedPreview.totalSpriteTileCount,
      bgTileColorStats: renderedPreview.bgTileColorStats,
      bgPaletteUsage: renderedPreview.bgPaletteUsage,
      spritePaletteUsage: renderedPreview.spritePaletteUsage,
      convergenceIterations: renderedPreview.convergenceIterations,
      convergenceHistory: renderedPreview.convergenceHistory,
      bgTilePaletteSheet: renderedPreview.bgTilePaletteSheet,
      spriteTilePaletteSheet: renderedPreview.spriteTilePaletteSheet,
      hardwareStatus: renderedPreview.hardwareStatus,
      hardwareFindings: renderedPreview.hardwareFindings
    }
  };
}

/** 制約を見ながら段階的に締めて最終プレビューを得るにゃ。 */
function convergeFamicomPreview(
  indexedImage: IndexedImage,
  universalColor: number,
  bgSubPalettes: [FamicomSubPalette, FamicomSubPalette, FamicomSubPalette, FamicomSubPalette],
  assignment: BgAssignmentResult,
  roi: RegionOfInterest | null,
  glitchPreviewEnabled: boolean
): RenderedPreview {
  const tuning: ReductionTuning = {
    bgMergeStepIndex: 0,
    spriteMergeStepIndex: 0,
    roiBgColorCapacity: 2,
    enableRoiSpriteForce: true,
    allowRoiSpriteCandidateRemoval: false
  };
  const convergenceHistory: FamicomConvergenceStep[] = [];
  let bestPreview = renderFamicomPreview(indexedImage, universalColor, bgSubPalettes, assignment, roi, tuning, 1, glitchPreviewEnabled);
  convergenceHistory.push(buildConvergenceStep(bestPreview));

  for (let iteration = 0; iteration < MAX_CONVERGENCE_ITERATIONS; iteration += 1) {
    const violations = evaluateReductionViolations(bestPreview);
    if (!hasReductionViolations(violations)) {
      bestPreview.convergenceHistory = [...convergenceHistory];
      return bestPreview;
    }

    const changed = tightenReductionTuning(tuning, violations);
    if (!changed) {
      return bestPreview;
    }

    bestPreview = renderFamicomPreview(indexedImage, universalColor, bgSubPalettes, assignment, roi, tuning, iteration + 2, glitchPreviewEnabled);
    convergenceHistory.push(buildConvergenceStep(bestPreview));
  }

  bestPreview.convergenceHistory = [...convergenceHistory];
  return bestPreview;
}

/** Canvasをファミコン色番号画像へ量子化するにゃ。 */
function quantizeCanvasToFamicomPalette(sourceCanvas: HTMLCanvasElement, options: ReductionOptions): IndexedImage {
  const context = require2dContext(sourceCanvas);
  const imageData = context.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  const pixels = new Uint8Array(sourceCanvas.width * sourceCanvas.height);

  for (let index = 0; index < pixels.length; index += 1) {
    const dataIndex = index * 4;
    const adjustedColor = adjustSourceColor(
      imageData.data[dataIndex],
      imageData.data[dataIndex + 1],
      imageData.data[dataIndex + 2],
      options
    );
    pixels[index] = reduceToNearestPaletteIndex(
      adjustedColor[0],
      adjustedColor[1],
      adjustedColor[2],
      options.quantizationMode
    );
  }

  return {
    width: sourceCanvas.width,
    height: sourceCanvas.height,
    pixels
  };
}

/** BG解析をまとめて実行するにゃ。 */
function analyzeFamicomBackground(indexedImage: IndexedImage, roi: RegionOfInterest | null): {
  universalColor: number;
  bgSubPalettes: [FamicomSubPalette, FamicomSubPalette, FamicomSubPalette, FamicomSubPalette];
  assignment: BgAssignmentResult;
} {
  const universalColor = chooseUniversalColor(indexedImage, roi);
  const cellAnalyses = analyzeAttributeCells(indexedImage, roi, universalColor);
  const { bgSubPalettes, assignment } = solveBackgroundPalettes(cellAnalyses, universalColor);

  return {
    universalColor,
    bgSubPalettes,
    assignment
  };
}

/** universal background color を選ぶにゃ。 */
function chooseUniversalColor(indexedImage: IndexedImage, roi: RegionOfInterest | null): number {
  const counts = new Map<number, number>();

  for (let y = 0; y < indexedImage.height; y += 1) {
    for (let x = 0; x < indexedImage.width; x += 1) {
      const pixelIndex = y * indexedImage.width + x;
      const colorIndex = indexedImage.pixels[pixelIndex];
      if (colorIndex === FORBIDDEN_COLOR_INDEX) {
        continue;
      }

      const weight = roi && isInsideRoi(x, y, roi) ? roi.detailWeight : 1;
      counts.set(colorIndex, (counts.get(colorIndex) ?? 0) + weight);
    }
  }

  return getMostFrequentColor(counts, DEFAULT_BACKGROUND_COLOR);
}

/** 属性セルごとの色要求を集計するにゃ。 */
function analyzeAttributeCells(indexedImage: IndexedImage, roi: RegionOfInterest | null, universalColor: number): CellAnalysis[] {
  const analyses: CellAnalysis[] = [];
  const cellsX = Math.ceil(indexedImage.width / ATTRIBUTE_SIZE);
  const cellsY = Math.ceil(indexedImage.height / ATTRIBUTE_SIZE);

  for (let cellY = 0; cellY < cellsY; cellY += 1) {
    for (let cellX = 0; cellX < cellsX; cellX += 1) {
      const frequencyMap = new Map<number, number>();
      const weightedFrequencyMap = new Map<number, number>();
      let overlapsRoi = false;

      for (let y = cellY * ATTRIBUTE_SIZE; y < Math.min(indexedImage.height, (cellY + 1) * ATTRIBUTE_SIZE); y += 1) {
        for (let x = cellX * ATTRIBUTE_SIZE; x < Math.min(indexedImage.width, (cellX + 1) * ATTRIBUTE_SIZE); x += 1) {
          const pixelIndex = y * indexedImage.width + x;
          const colorIndex = indexedImage.pixels[pixelIndex];
          if (colorIndex === universalColor || colorIndex === FORBIDDEN_COLOR_INDEX) {
            continue;
          }

          const inRoi = roi ? isInsideRoi(x, y, roi) : false;
          if (inRoi) {
            overlapsRoi = true;
          }

          const weight = inRoi && roi ? roi.detailWeight : 1;
          frequencyMap.set(colorIndex, (frequencyMap.get(colorIndex) ?? 0) + 1);
          weightedFrequencyMap.set(colorIndex, (weightedFrequencyMap.get(colorIndex) ?? 0) + weight);
        }
      }

      const topColors = [...weightedFrequencyMap.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, SUB_PALETTE_COLOR_COUNT)
        .map(([color]) => color);

      analyses.push({
        cellX,
        cellY,
        frequencyMap,
        weightedFrequencyMap,
        topColors,
        overlapsRoi
      });
    }
  }

  return analyses;
}

/** BGパレットを割り当て結果込みで整えるにゃ。 */
function solveBackgroundPalettes(
  cellAnalyses: CellAnalysis[],
  universalColor: number
): {
  bgSubPalettes: [FamicomSubPalette, FamicomSubPalette, FamicomSubPalette, FamicomSubPalette];
  assignment: BgAssignmentResult;
} {
  let bgSubPalettes = buildInitialSubPalettes(cellAnalyses);
  let assignment = assignPalettesToCells(cellAnalyses, bgSubPalettes, universalColor);

  for (let pass = 0; pass < BG_PALETTE_REFINEMENT_PASSES; pass += 1) {
    bgSubPalettes = rebuildSubPalettesFromAssignments(cellAnalyses, assignment);
    assignment = assignPalettesToCells(cellAnalyses, bgSubPalettes, universalColor);
  }

  for (let pass = 0; pass < LOW_BG_PALETTE_RESEED_MAX_PASSES; pass += 1) {
    const improved = reseedLowUsageBgPalettes(cellAnalyses, assignment, bgSubPalettes, universalColor);
    if (!improved) {
      break;
    }

    bgSubPalettes = improved.bgSubPalettes;
    assignment = improved.assignment;
  }

  return {
    bgSubPalettes,
    assignment
  };
}

/** 初期の4つのBGサブパレット候補を作るにゃ。 */
function buildInitialSubPalettes(cellAnalyses: CellAnalysis[]): [FamicomSubPalette, FamicomSubPalette, FamicomSubPalette, FamicomSubPalette] {
  const paletteSeeds = [...cellAnalyses]
    .sort((left, right) => sumMap(right.weightedFrequencyMap) - sumMap(left.weightedFrequencyMap))
    .slice(0, BG_SUB_PALETTE_COUNT)
    .map((cell) => fillSubPalette(cell.topColors));

  while (paletteSeeds.length < BG_SUB_PALETTE_COUNT) {
    paletteSeeds.push(fillSubPalette([]));
  }

  return [
    paletteSeeds[0],
    paletteSeeds[1],
    paletteSeeds[2],
    paletteSeeds[3]
  ];
}

/** 割り当て済み属性セルからBGサブパレットを再構築するにゃ。 */
function rebuildSubPalettesFromAssignments(
  cellAnalyses: CellAnalysis[],
  assignment: BgAssignmentResult
): [FamicomSubPalette, FamicomSubPalette, FamicomSubPalette, FamicomSubPalette] {
  const weightedColorsByPalette = Array.from(
    { length: BG_SUB_PALETTE_COUNT },
    () => new Map<number, number>()
  );
  const assignedCellCount = new Uint16Array(BG_SUB_PALETTE_COUNT);
  const cellAnalysisMap = new Map(cellAnalyses.map((cell) => [makeCellKey(cell.cellX, cell.cellY), cell]));

  for (const attributeCell of assignment.attributeCells) {
    const key = makeCellKey(attributeCell.cellX, attributeCell.cellY);
    const analysis = cellAnalysisMap.get(key);
    if (!analysis) {
      continue;
    }

    assignedCellCount[attributeCell.paletteIndex] += 1;
    const bucket = weightedColorsByPalette[attributeCell.paletteIndex];
    for (const [color, weight] of analysis.weightedFrequencyMap.entries()) {
      bucket.set(color, (bucket.get(color) ?? 0) + weight);
    }
  }

  const rebuilt = weightedColorsByPalette.map((bucket, paletteIndex) => {
    if (assignedCellCount[paletteIndex] === 0) {
      return fillSubPalette([]);
    }

    const colors = [...bucket.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, SUB_PALETTE_COLOR_COUNT)
      .map(([color]) => color);
    return fillSubPalette(colors);
  });

  return [
    rebuilt[0],
    rebuilt[1],
    rebuilt[2],
    rebuilt[3]
  ];
}

/** 属性セルへ最適パレットを割り当てるにゃ。 */
function assignPalettesToCells(
  cellAnalyses: CellAnalysis[],
  bgSubPalettes: [FamicomSubPalette, FamicomSubPalette, FamicomSubPalette, FamicomSubPalette],
  universalColor: number
): BgAssignmentResult {
  const attributeCells = cellAnalyses.map((cell) => {
    let bestPaletteIndex = 0;
    let bestScore = Number.POSITIVE_INFINITY;
    let bestMissing = Number.POSITIVE_INFINITY;

    for (let paletteIndex = 0; paletteIndex < bgSubPalettes.length; paletteIndex += 1) {
      const allowed = getAllowedColors(universalColor, bgSubPalettes[paletteIndex]);
      let missingPixelCount = 0;
      let weightedScore = 0;

      for (const [colorIndex, count] of cell.frequencyMap.entries()) {
        if (!allowed.has(colorIndex)) {
          missingPixelCount += count;
          weightedScore += cell.weightedFrequencyMap.get(colorIndex) ?? count;
        }
      }

      if (weightedScore < bestScore || (weightedScore === bestScore && missingPixelCount < bestMissing)) {
        bestScore = weightedScore;
        bestMissing = missingPixelCount;
        bestPaletteIndex = paletteIndex;
      }
    }

    const supportedColors = [...getAllowedColors(universalColor, bgSubPalettes[bestPaletteIndex])].sort((left, right) => left - right);
    return {
      cellX: cell.cellX,
      cellY: cell.cellY,
      paletteIndex: bestPaletteIndex,
      topColors: [...cell.topColors],
      supportedColors,
      missingPixelCount: bestMissing,
      weightedScore: bestScore,
      overlapsRoi: cell.overlapsRoi,
      renderedBySpritePixelCount: 0,
      unresolvedPixelCount: 0
    };
  });

  return {
    attributeCells,
    allowedByCell: new Map(attributeCells.map((cell) => [makeCellKey(cell.cellX, cell.cellY), cell]))
  };
}

/** 低使用BGを未カバー色群で再シードし、改善した場合だけ採用するにゃ。 */
function reseedLowUsageBgPalettes(
  cellAnalyses: CellAnalysis[],
  assignment: BgAssignmentResult,
  bgSubPalettes: [FamicomSubPalette, FamicomSubPalette, FamicomSubPalette, FamicomSubPalette],
  universalColor: number
):
  | {
      bgSubPalettes: [FamicomSubPalette, FamicomSubPalette, FamicomSubPalette, FamicomSubPalette];
      assignment: BgAssignmentResult;
    }
  | null {
  const assignmentCounts = new Uint16Array(BG_SUB_PALETTE_COUNT);
  for (const cell of assignment.attributeCells) {
    assignmentCounts[cell.paletteIndex] += 1;
  }

  const lowUsageIndices = [...assignmentCounts.entries()]
    .filter(([, count]) => count <= LOW_BG_PALETTE_USAGE_CELL_THRESHOLD)
    .map(([index]) => index);
  if (lowUsageIndices.length === 0) {
    return null;
  }

  const candidatePalettes = [...bgSubPalettes] as [FamicomSubPalette, FamicomSubPalette, FamicomSubPalette, FamicomSubPalette];
  let changed = false;
  const reservedColors = new Set<number>();

  for (const paletteIndex of lowUsageIndices) {
    const reseeded = buildLowUsageBgPaletteSeed(cellAnalyses, assignment, universalColor, reservedColors);
    if (reseeded.join(",") === candidatePalettes[paletteIndex].join(",")) {
      continue;
    }

    candidatePalettes[paletteIndex] = reseeded;
    for (const color of reseeded) {
      reservedColors.add(color);
    }
    changed = true;
  }

  if (!changed) {
    return null;
  }

  const candidateAssignment = assignPalettesToCells(cellAnalyses, candidatePalettes, universalColor);
  if (calculateAssignmentCost(candidateAssignment) >= calculateAssignmentCost(assignment)) {
    return null;
  }

  return {
    bgSubPalettes: candidatePalettes,
    assignment: candidateAssignment
  };
}

/** 未カバー色群の重みから低使用BG向けの再シード3色を作るにゃ。 */
function buildLowUsageBgPaletteSeed(
  cellAnalyses: CellAnalysis[],
  assignment: BgAssignmentResult,
  universalColor: number,
  reservedColors: Set<number>
): FamicomSubPalette {
  const deficitMap = new Map<number, number>();
  const cellMap = new Map(cellAnalyses.map((cell) => [makeCellKey(cell.cellX, cell.cellY), cell]));

  for (const assignedCell of assignment.attributeCells) {
    const cellAnalysis = cellMap.get(makeCellKey(assignedCell.cellX, assignedCell.cellY));
    if (!cellAnalysis) {
      continue;
    }

    const allowedColors = new Set(assignedCell.supportedColors);
    for (const [colorIndex, weight] of cellAnalysis.weightedFrequencyMap.entries()) {
      if (colorIndex === universalColor || allowedColors.has(colorIndex)) {
        continue;
      }

      deficitMap.set(colorIndex, (deficitMap.get(colorIndex) ?? 0) + weight);
    }
  }

  const colors = [...deficitMap.entries()]
    .sort((left, right) => right[1] - left[1])
    .filter(([color]) => !reservedColors.has(color))
    .slice(0, SUB_PALETTE_COLOR_COUNT)
    .map(([color]) => color);
  return fillSubPalette(colors);
}

/** 属性セル割り当て結果の総コストを返すにゃ。 */
function calculateAssignmentCost(assignment: BgAssignmentResult): number {
  return assignment.attributeCells.reduce((total, cell) => total + cell.weightedScore + cell.missingPixelCount * 0.25, 0);
}

/** BG割り当て結果からプレビュー画像を描くにゃ。 */
function renderFamicomPreview(
  indexedImage: IndexedImage,
  universalColor: number,
  bgSubPalettes: [FamicomSubPalette, FamicomSubPalette, FamicomSubPalette, FamicomSubPalette],
  assignment: BgAssignmentResult,
  roi: RegionOfInterest | null,
  tuning: ReductionTuning,
  convergenceIterations: number,
  glitchPreviewEnabled: boolean
): RenderedPreview {
  const finalCanvas = document.createElement("canvas");
  const bgCanvas = document.createElement("canvas");
  const spriteCanvas = document.createElement("canvas");
  finalCanvas.width = indexedImage.width;
  finalCanvas.height = indexedImage.height;
  bgCanvas.width = indexedImage.width;
  bgCanvas.height = indexedImage.height;
  spriteCanvas.width = indexedImage.width;
  spriteCanvas.height = indexedImage.height;

  const finalContext = require2dContext(finalCanvas);
  const bgContext = require2dContext(bgCanvas);
  const spriteContext = require2dContext(spriteCanvas);
  const finalImage = finalContext.createImageData(indexedImage.width, indexedImage.height);
  const bgImage = bgContext.createImageData(indexedImage.width, indexedImage.height);
  const finalSpriteMask = new Uint8Array(indexedImage.width * indexedImage.height);
  const spriteImage = spriteContext.createImageData(indexedImage.width, indexedImage.height);
  const spriteCandidates = new Map<string, SpriteTileCandidate>();
  const spritePixelCountByCell = new Map<string, number>();

  for (let y = 0; y < indexedImage.height; y += 1) {
    for (let x = 0; x < indexedImage.width; x += 1) {
      const pixelIndex = y * indexedImage.width + x;
      const colorIndex = indexedImage.pixels[pixelIndex];
      const attributeCell = assignment.allowedByCell.get(makeCellKey(Math.floor(x / ATTRIBUTE_SIZE), Math.floor(y / ATTRIBUTE_SIZE)));
      if (!attributeCell) {
        continue;
      }

      const subPalette = bgSubPalettes[attributeCell.paletteIndex];
      const allowedColors = getAllowedColors(universalColor, subPalette);
      const isBgSupported = allowedColors.has(colorIndex);
      const roiForcesSprite = shouldForceSpriteInRoi(
        x,
        y,
        colorIndex,
        attributeCell,
        universalColor,
        roi,
        tuning
      );
      const finalColor = isBgSupported
        ? colorIndex
        : chooseNearestAllowedColor(colorIndex, universalColor, subPalette);

      writePixel(finalImage.data, pixelIndex, FAMICOM_PREVIEW_PALETTE[finalColor], 255);
      writePixel(bgImage.data, pixelIndex, FAMICOM_PREVIEW_PALETTE[finalColor], 255);

      if (isBgSupported && !roiForcesSprite) {
        writePixel(spriteImage.data, pixelIndex, UNUSED_PREVIEW_PIXEL, 255);
        continue;
      }

      writePixel(spriteImage.data, pixelIndex, FAMICOM_PREVIEW_PALETTE[colorIndex], 255);
      collectSpriteCandidate(spriteCandidates, x, y, attributeCell.overlapsRoi);
      const cellKey = makeCellKey(attributeCell.cellX, attributeCell.cellY);
      spritePixelCountByCell.set(cellKey, (spritePixelCountByCell.get(cellKey) ?? 0) + 1);
    }
  }

  for (const attributeCell of assignment.attributeCells) {
    attributeCell.renderedBySpritePixelCount = spritePixelCountByCell.get(makeCellKey(attributeCell.cellX, attributeCell.cellY)) ?? 0;
    attributeCell.unresolvedPixelCount = 0;
  }

  const tightenedSpriteCandidates = tightenSpriteCandidatesToFit(indexedImage.height, spriteCandidates, tuning);
  const spriteSelection = selectSpriteTiles(indexedImage.height, tightenedSpriteCandidates);
  clearNonSelectedSpritePixels(indexedImage, spriteImage.data, spriteSelection.selectedTiles);
  const spriteTileAnalyses = analyzeSelectedSpriteTiles(indexedImage, spriteSelection.selectedTiles);
  const spriteClusterAnalyses = analyzeSpriteClusters(tightenedSpriteCandidates, spriteSelection.selectedTiles, spriteTileAnalyses);
  const spriteSubPalettes = solveSpriteSubPalettes(spriteClusterAnalyses);
  const spritePaletteAssignments = assignSpritePalettes(spriteClusterAnalyses, spriteSubPalettes);
  recolorAcceptedSpritePixels(
    indexedImage,
    spriteImage.data,
    spriteSelection.selectedTiles,
    spriteClusterAnalyses,
    spriteSubPalettes,
    spritePaletteAssignments
  );
  compositeAcceptedSpritesIntoFinal(
    indexedImage,
    finalImage.data,
    finalSpriteMask,
    spriteSelection.selectedTiles,
    spriteClusterAnalyses,
    spriteSubPalettes,
    spritePaletteAssignments
  );
  consolidateSpriteTiles(spriteImage, finalImage.data, finalSpriteMask, spriteSelection.selectedTiles, tuning);
  spriteContext.putImageData(spriteImage, 0, 0);
  const sortedSpriteCandidates = buildGroupedSpriteCandidates(
    tightenedSpriteCandidates,
    spriteSelection.selectedTiles,
    spriteClusterAnalyses,
    spriteSubPalettes
  );
  consolidateBgTiles(bgImage, finalImage.data, finalSpriteMask, assignment.allowedByCell, tuning);
  if (glitchPreviewEnabled) {
    applyGlitchBgReferenceCorruption(bgImage, finalImage.data, finalSpriteMask, roi);
  }
  finalContext.putImageData(finalImage, 0, 0);
  bgContext.putImageData(bgImage, 0, 0);
  const spriteTileStats = countUniqueSpriteTiles(spriteImage, spriteSelection.selectedTiles);
  const bgTileStats = countUniqueBgTiles(bgImage);
  const bgTileColorStats = analyzeBgTileColorStats(bgImage, universalColor);
  const bgPaletteUsage = analyzeBgPaletteUsage(bgImage, assignment.attributeCells, universalColor, bgSubPalettes);
  const spritePaletteUsage = analyzeSpritePaletteUsage(
    spriteImage,
    spriteSelection.selectedTiles,
    spriteClusterAnalyses,
    spritePaletteAssignments,
    spriteSubPalettes
  );
  const bgTilePaletteSheet = buildBgTilePaletteSheet(bgImage);
  const spriteTilePaletteSheet = buildSpriteTilePaletteSheet(spriteImage, spriteSelection.selectedTiles);
  populateUnresolvedPixelCounts(assignment.attributeCells, spriteSelection.rejectedTiles);
  const unresolvedAttributeCellCount = assignment.attributeCells.filter((cell) => cell.unresolvedPixelCount > 0).length;
  const unresolvedPixelCount = assignment.attributeCells.reduce((total, cell) => total + cell.unresolvedPixelCount, 0);
  const hardwareCheck = evaluateHardwareLimits(bgTileStats, spriteTileStats, spriteSelection.scanlineOverflowCount);

  return {
    finalCanvas,
    bgCanvas,
    spriteCanvas,
    spriteSubPalettes,
    spriteCandidates: sortedSpriteCandidates,
    scanlineOverflowCount: spriteSelection.scanlineOverflowCount,
    acceptedSpriteTiles: [...spriteSelection.selectedTiles.values()].map((tile) => ({ tileX: tile.tileX, tileY: tile.tileY })),
    rejectedSpriteTiles: [...spriteSelection.rejectedTiles.values()].map((tile) => ({ tileX: tile.tileX, tileY: tile.tileY })),
    uniqueBgTileCount: bgTileStats.uniqueTileCount,
    totalBgTileCount: bgTileStats.totalTileCount,
    uniqueSpriteTileCount: spriteTileStats.uniqueTileCount,
    totalSpriteTileCount: spriteTileStats.totalTileCount,
    bgTileColorStats,
    bgPaletteUsage,
    spritePaletteUsage,
    unresolvedAttributeCellCount,
    unresolvedPixelCount,
    convergenceIterations,
    convergenceHistory: [],
    bgTilePaletteSheet,
    spriteTilePaletteSheet,
    hardwareStatus: hardwareCheck.status,
    hardwareFindings: hardwareCheck.findings
  };
}

/** Spriteでも救えなかった画素数を属性セルへ書き戻すにゃ。 */
function populateUnresolvedPixelCounts(
  attributeCells: FamicomAttributeCell[],
  rejectedTiles: Map<string, SpriteTileCandidate>
): void {
  const unresolvedByCell = new Map<string, number>();

  for (const tile of rejectedTiles.values()) {
    const cellX = Math.floor(tile.tileX / 2);
    const cellY = Math.floor(tile.tileY / 2);
    const cellKey = makeCellKey(cellX, cellY);
    unresolvedByCell.set(cellKey, (unresolvedByCell.get(cellKey) ?? 0) + tile.pixelCount);
  }

  for (const cell of attributeCells) {
    cell.unresolvedPixelCount = unresolvedByCell.get(makeCellKey(cell.cellX, cell.cellY)) ?? 0;
  }
}

/** ROI外の弱いSprite候補を削って、採用可能な候補だけへ寄せるにゃ。 */
function tightenSpriteCandidatesToFit(
  imageHeight: number,
  spriteCandidates: Map<string, SpriteTileCandidate>,
  tuning: ReductionTuning
): Map<string, SpriteTileCandidate> {
  const tightened = new Map(spriteCandidates);

  while (true) {
    const selection = selectSpriteTiles(imageHeight, tightened);
    if (selection.rejectedTiles.size === 0) {
      return tightened;
    }

    const removableCandidates = [...selection.rejectedTiles.entries()]
      .filter((entry) => tuning.allowRoiSpriteCandidateRemoval || !entry[1].overlapsRoi)
      .sort((left, right) => left[1].pixelCount - right[1].pixelCount);

    if (removableCandidates.length === 0) {
      return tightened;
    }

    tightened.delete(removableCandidates[0][0]);
  }
}

/** ROI内の細かい色をSprite優先へ回すか判定するにゃ。 */
function shouldForceSpriteInRoi(
  x: number,
  y: number,
  colorIndex: number,
  attributeCell: FamicomAttributeCell,
  universalColor: number,
  roi: RegionOfInterest | null,
  tuning: ReductionTuning
): boolean {
  if (!tuning.enableRoiSpriteForce || !roi || !isInsideRoi(x, y, roi)) {
    return false;
  }

  if (colorIndex === universalColor) {
    return false;
  }

  if (attributeCell.topColors.length <= tuning.roiBgColorCapacity) {
    return false;
  }

  const primaryBgColors = new Set(attributeCell.topColors.slice(0, tuning.roiBgColorCapacity));
  return !primaryBgColors.has(colorIndex);
}

/** BGの類似8x8タイルを代表タイルへ寄せてユニーク数を減らすにゃ。 */
function consolidateBgTiles(
  bgImage: ImageData,
  finalPixelData: Uint8ClampedArray,
  finalSpriteMask: Uint8Array,
  allowedByCell: Map<string, FamicomAttributeCell>,
  tuning: ReductionTuning
): void {
  const tilesX = Math.ceil(bgImage.width / TILE_SIZE);
  const tilesY = Math.ceil(bgImage.height / TILE_SIZE);
  const tileEntries = Array.from({ length: tilesX * tilesY }, (_, index) => {
    const tileX = index % tilesX;
    const tileY = Math.floor(index / tilesX);
    const attributeCell = allowedByCell.get(makeCellKey(Math.floor(tileX / 2), Math.floor(tileY / 2)));
    return {
      tileX,
      tileY,
      paletteIndex: attributeCell?.paletteIndex ?? -1,
      pixels: readTilePixels(bgImage, tileX, tileY)
    };
  });

  const exactUniqueCount = new Set(tileEntries.map((tile) => tile.pixels.join(","))).size;
  if (exactUniqueCount <= FAMICOM_PATTERN_TABLE_TILE_LIMIT) {
    return;
  }

  const representatives: Array<{ pixels: number[]; usageCount: number; paletteIndex: number }> = [];

  for (const tile of tileEntries) {
    let bestRepresentativeIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let index = 0; index < representatives.length; index += 1) {
      if (representatives[index].paletteIndex !== tile.paletteIndex) {
        continue;
      }
      const distance = measureTileDistance(tile.pixels, representatives[index].pixels);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestRepresentativeIndex = index;
      }
    }

    const canCreateNewRepresentative =
      representatives.length < FAMICOM_PATTERN_TABLE_TILE_LIMIT &&
      (bestRepresentativeIndex === -1 || bestDistance > BG_TILE_MERGE_THRESHOLD_STEPS[tuning.bgMergeStepIndex]);

    if (canCreateNewRepresentative) {
      representatives.push({ pixels: tile.pixels, usageCount: 1, paletteIndex: tile.paletteIndex });
      continue;
    }

    const representative = representatives[Math.max(0, bestRepresentativeIndex)];
    representative.usageCount += 1;
    writeTilePixels(bgImage, tile.tileX, tile.tileY, representative.pixels);
    writeTilePixelsToFinal(bgImage.width, finalPixelData, finalSpriteMask, tile.tileX, tile.tileY, representative.pixels);
  }
}

/** BG画像のユニーク8x8タイル数を数えるにゃ。 */
function countUniqueBgTiles(bgImage: ImageData): { uniqueTileCount: number; totalTileCount: number } {
  const tilesX = Math.ceil(bgImage.width / TILE_SIZE);
  const tilesY = Math.ceil(bgImage.height / TILE_SIZE);
  const tileHashes = new Set<string>();

  for (let tileY = 0; tileY < tilesY; tileY += 1) {
    for (let tileX = 0; tileX < tilesX; tileX += 1) {
      const parts: number[] = [];

      for (let y = tileY * TILE_SIZE; y < Math.min(bgImage.height, (tileY + 1) * TILE_SIZE); y += 1) {
        for (let x = tileX * TILE_SIZE; x < Math.min(bgImage.width, (tileX + 1) * TILE_SIZE); x += 1) {
          const pixelIndex = (y * bgImage.width + x) * 4;
          parts.push(
            bgImage.data[pixelIndex],
            bgImage.data[pixelIndex + 1],
            bgImage.data[pixelIndex + 2],
            bgImage.data[pixelIndex + 3]
          );
        }
      }

      tileHashes.add(parts.join(","));
    }
  }

  return {
    uniqueTileCount: tileHashes.size,
    totalTileCount: tilesX * tilesY
  };
}

/** BGの8x8タイルが実際に何色使っているか集計するにゃ。 */
function analyzeBgTileColorStats(
  bgImage: ImageData,
  universalColor: number
): FamicomBgTileColorStats {
  const stats: FamicomBgTileColorStats = {
    oneColorTileCount: 0,
    twoColorTileCount: 0,
    threeColorTileCount: 0,
    fourColorTileCount: 0,
    universalColorUsedTileCount: 0
  };
  const tilesX = Math.ceil(bgImage.width / TILE_SIZE);
  const tilesY = Math.ceil(bgImage.height / TILE_SIZE);

  for (let tileY = 0; tileY < tilesY; tileY += 1) {
    for (let tileX = 0; tileX < tilesX; tileX += 1) {
      const tilePixels = readTilePixels(bgImage, tileX, tileY);
      const usedColors = new Set<number>();
      let usesUniversalColor = false;

      for (let index = 0; index < tilePixels.length; index += 4) {
        const paletteIndex = findPaletteIndexByRgb(
          tilePixels[index],
          tilePixels[index + 1],
          tilePixels[index + 2]
        );
        if (paletteIndex === null) {
          continue;
        }

        usedColors.add(paletteIndex);
        if (paletteIndex === universalColor) {
          usesUniversalColor = true;
        }
      }

      switch (usedColors.size) {
        case 0:
        case 1:
          stats.oneColorTileCount += 1;
          break;
        case 2:
          stats.twoColorTileCount += 1;
          break;
        case 3:
          stats.threeColorTileCount += 1;
          break;
        default:
          stats.fourColorTileCount += 1;
          break;
      }

      if (usesUniversalColor) {
        stats.universalColorUsedTileCount += 1;
      }
    }
  }

  return stats;
}

/** BGパレットごとの利用ドット数を返すにゃ。 */
function analyzeBgPaletteUsage(
  bgImage: ImageData,
  attributeCells: FamicomAttributeCell[],
  universalColor: number,
  bgSubPalettes: [FamicomSubPalette, FamicomSubPalette, FamicomSubPalette, FamicomSubPalette]
): FamicomPaletteUsageEntry[][] {
  const usageMaps = bgSubPalettes.map((subPalette) => createPaletteUsageMap([universalColor, ...subPalette]));
  const cellMap = new Map(attributeCells.map((cell) => [makeCellKey(cell.cellX, cell.cellY), cell]));

  for (let y = 0; y < bgImage.height; y += 1) {
    for (let x = 0; x < bgImage.width; x += 1) {
      const cell = cellMap.get(makeCellKey(Math.floor(x / ATTRIBUTE_SIZE), Math.floor(y / ATTRIBUTE_SIZE)));
      if (!cell) {
        continue;
      }

      const pixelIndex = (y * bgImage.width + x) * 4;
      const colorIndex = findPaletteIndexByRgb(
        bgImage.data[pixelIndex],
        bgImage.data[pixelIndex + 1],
        bgImage.data[pixelIndex + 2]
      );
      if (colorIndex === null) {
        continue;
      }

      const usageMap = usageMaps[cell.paletteIndex];
      if (!usageMap.has(colorIndex)) {
        continue;
      }
      usageMap.set(colorIndex, (usageMap.get(colorIndex) ?? 0) + 1);
    }
  }

  return usageMaps.map(convertPaletteUsageMapToEntries);
}

/** Spriteパレットごとの利用ドット数を返すにゃ。 */
function analyzeSpritePaletteUsage(
  spriteImage: ImageData,
  selectedTiles: Map<string, SpriteTileCandidate>,
  spriteClusterAnalyses: Map<string, SpriteClusterAnalysis>,
  spritePaletteAssignments: Map<string, number>,
  spriteSubPalettes: [FamicomSubPalette, FamicomSubPalette, FamicomSubPalette, FamicomSubPalette]
): FamicomPaletteUsageEntry[][] {
  const usageMaps = spriteSubPalettes.map((subPalette) => createPaletteUsageMap(subPalette));
  const tilePaletteIndexMap = new Map<string, number>();

  for (const clusterAnalysis of spriteClusterAnalyses.values()) {
    const paletteIndex = spritePaletteAssignments.get(clusterAnalysis.key) ?? chooseBestSpritePalette(clusterAnalysis.colors, spriteSubPalettes);
    for (const tileKey of clusterAnalysis.tileKeys) {
      tilePaletteIndexMap.set(tileKey, paletteIndex);
    }
  }

  for (const tile of selectedTiles.values()) {
    const paletteIndex = tilePaletteIndexMap.get(makeCellKey(tile.tileX, tile.tileY));
    if (paletteIndex === undefined) {
      continue;
    }

    for (let y = tile.tileY * TILE_SIZE; y < Math.min(spriteImage.height, (tile.tileY + 1) * TILE_SIZE); y += 1) {
      for (let x = tile.tileX * TILE_SIZE; x < Math.min(spriteImage.width, (tile.tileX + 1) * TILE_SIZE); x += 1) {
        const pixelIndex = (y * spriteImage.width + x) * 4;
        const colorIndex = findPaletteIndexByRgb(
          spriteImage.data[pixelIndex],
          spriteImage.data[pixelIndex + 1],
          spriteImage.data[pixelIndex + 2]
        );
        if (colorIndex === null) {
          continue;
        }

        const usageMap = usageMaps[paletteIndex];
        if (!usageMap.has(colorIndex)) {
          continue;
        }

        usageMap.set(colorIndex, (usageMap.get(colorIndex) ?? 0) + 1);
      }
    }
  }

  return usageMaps.map(convertPaletteUsageMapToEntries);
}

/** パレット利用数マップを初期化するにゃ。 */
function createPaletteUsageMap(colors: number[]): Map<number, number> {
  return new Map([...new Set(colors)].map((color) => [color, 0]));
}

/** パレット利用数マップを表示用配列へ変換するにゃ。 */
function convertPaletteUsageMapToEntries(usageMap: Map<number, number>): FamicomPaletteUsageEntry[] {
  return [...usageMap.entries()].map(([colorIndex, pixelCount]) => ({
    colorIndex,
    pixelCount
  }));
}

/** RGB値からファミコンパレット番号を逆引きするにゃ。 */
function findPaletteIndexByRgb(red: number, green: number, blue: number): number | null {
  for (let index = 0; index < FAMICOM_PREVIEW_PALETTE.length; index += 1) {
    const color = FAMICOM_PREVIEW_PALETTE[index];
    if (color[0] === red && color[1] === green && color[2] === blue) {
      return index;
    }
  }

  return null;
}

/** 最終生成後にROI外のBG参照番地を規則的にずらすにゃ。 */
function applyGlitchBgReferenceCorruption(
  bgImage: ImageData,
  finalPixelData: Uint8ClampedArray,
  finalSpriteMask: Uint8Array,
  roi: RegionOfInterest | null
): void {
  const tilesX = Math.ceil(bgImage.width / TILE_SIZE);
  const tilesY = Math.ceil(bgImage.height / TILE_SIZE);
  const bgAddressMap = buildBgAddressMap(bgImage);

  for (let tileY = 0; tileY < tilesY; tileY += 1) {
    const addressOffset = getGlitchAddressOffset(tileY, bgAddressMap.uniqueTiles.length);

    for (let tileX = 0; tileX < tilesX; tileX += 1) {
      if (doesTileOverlapRoi(tileX, tileY, roi)) {
        continue;
      }

      const targetAddress = bgAddressMap.tileAddresses[tileY * tilesX + tileX];
      const sourceAddress = wrapTileAddress(targetAddress + addressOffset, bgAddressMap.uniqueTiles.length);
      const sourcePixels = bgAddressMap.uniqueTiles[sourceAddress];

      writeTilePixels(bgImage, tileX, tileY, sourcePixels);
      writeTilePixelsToFinal(bgImage.width, finalPixelData, finalSpriteMask, tileX, tileY, sourcePixels);
    }
  }
}

/** 現在のBG画像から使用中番地表を作るにゃ。 */
function buildBgAddressMap(bgImage: ImageData): { uniqueTiles: number[][]; tileAddresses: number[] } {
  const tilesX = Math.ceil(bgImage.width / TILE_SIZE);
  const tilesY = Math.ceil(bgImage.height / TILE_SIZE);
  const uniqueTiles: number[][] = [];
  const tileAddresses: number[] = [];
  const addressByHash = new Map<string, number>();

  for (let tileY = 0; tileY < tilesY; tileY += 1) {
    for (let tileX = 0; tileX < tilesX; tileX += 1) {
      const pixels = readTilePixels(bgImage, tileX, tileY);
      const hash = pixels.join(",");
      const existingAddress = addressByHash.get(hash);

      if (existingAddress !== undefined) {
        tileAddresses.push(existingAddress);
        continue;
      }

      const newAddress = uniqueTiles.length;
      uniqueTiles.push(pixels);
      tileAddresses.push(newAddress);
      addressByHash.set(hash, newAddress);
    }
  }

  return {
    uniqueTiles,
    tileAddresses
  };
}

/** BGのユニーク8x8タイルを番地順シートへ並べるにゃ。 */
function buildBgTilePaletteSheet(bgImage: ImageData): FamicomTilePaletteSheet {
  const tilesX = Math.ceil(bgImage.width / TILE_SIZE);
  const tilesY = Math.ceil(bgImage.height / TILE_SIZE);
  const entryByHash = new Map<string, { pixels: number[]; usageCount: number }>();
  const orderedEntries: Array<{ pixels: number[]; usageCount: number }> = [];

  for (let tileY = 0; tileY < tilesY; tileY += 1) {
    for (let tileX = 0; tileX < tilesX; tileX += 1) {
      const pixels = readTilePixels(bgImage, tileX, tileY);
      const hash = pixels.join(",");
      const existing = entryByHash.get(hash);
      if (existing) {
        existing.usageCount += 1;
        continue;
      }

      const entry = {
        pixels,
        usageCount: 1
      };
      entryByHash.set(hash, entry);
      orderedEntries.push(entry);
    }
  }

  return renderTilePaletteSheet(orderedEntries);
}

/** 指定タイルのRGBA配列を読むにゃ。 */
function readTilePixels(image: ImageData, tileX: number, tileY: number): number[] {
  const parts: number[] = [];

  for (let y = tileY * TILE_SIZE; y < Math.min(image.height, (tileY + 1) * TILE_SIZE); y += 1) {
    for (let x = tileX * TILE_SIZE; x < Math.min(image.width, (tileX + 1) * TILE_SIZE); x += 1) {
      const pixelIndex = (y * image.width + x) * 4;
      parts.push(
        image.data[pixelIndex],
        image.data[pixelIndex + 1],
        image.data[pixelIndex + 2],
        image.data[pixelIndex + 3]
      );
    }
  }

  return parts;
}

/** 指定タイルへRGBA配列を書き戻すにゃ。 */
function writeTilePixels(image: ImageData, tileX: number, tileY: number, pixels: number[]): void {
  let sourceIndex = 0;

  for (let y = tileY * TILE_SIZE; y < Math.min(image.height, (tileY + 1) * TILE_SIZE); y += 1) {
    for (let x = tileX * TILE_SIZE; x < Math.min(image.width, (tileX + 1) * TILE_SIZE); x += 1) {
      const pixelIndex = (y * image.width + x) * 4;
      image.data[pixelIndex] = pixels[sourceIndex];
      image.data[pixelIndex + 1] = pixels[sourceIndex + 1];
      image.data[pixelIndex + 2] = pixels[sourceIndex + 2];
      image.data[pixelIndex + 3] = pixels[sourceIndex + 3];
      sourceIndex += 4;
    }
  }
}

/** BG統合結果を、Spriteで覆われていない最終画像へ反映するにゃ。 */
function writeTilePixelsToFinal(
  imageWidth: number,
  finalPixelData: Uint8ClampedArray,
  finalSpriteMask: Uint8Array,
  tileX: number,
  tileY: number,
  pixels: number[]
): void {
  let sourceIndex = 0;

  for (let y = tileY * TILE_SIZE; y < Math.min(240, (tileY + 1) * TILE_SIZE); y += 1) {
    for (let x = tileX * TILE_SIZE; x < Math.min(imageWidth, (tileX + 1) * TILE_SIZE); x += 1) {
      const pixelIndex = y * imageWidth + x;
      if (finalSpriteMask[pixelIndex] === 0) {
        const dataIndex = pixelIndex * 4;
        finalPixelData[dataIndex] = pixels[sourceIndex];
        finalPixelData[dataIndex + 1] = pixels[sourceIndex + 1];
        finalPixelData[dataIndex + 2] = pixels[sourceIndex + 2];
        finalPixelData[dataIndex + 3] = pixels[sourceIndex + 3];
      }
      sourceIndex += 4;
    }
  }
}

/** 指定8x8タイルがROIへ触れているか返すにゃ。 */
function doesTileOverlapRoi(tileX: number, tileY: number, roi: RegionOfInterest | null): boolean {
  if (!roi || !roi.enabled) {
    return false;
  }

  const left = tileX * TILE_SIZE;
  const top = tileY * TILE_SIZE;
  const right = left + TILE_SIZE;
  const bottom = top + TILE_SIZE;

  return left < roi.x + roi.width && right > roi.x && top < roi.y + roi.height && bottom > roi.y;
}

/** 行単位で使う番地オフセットを返すにゃ。 */
function getGlitchAddressOffset(tileRow: number, totalTileCount: number): number {
  const baseStride = 7;
  const bandIndex = tileRow % 4;

  switch (bandIndex) {
    case 0:
      return baseStride;
    case 1:
      return -baseStride;
    case 2:
      return baseStride * 2;
    case 3:
      return -(Math.max(3, Math.floor(totalTileCount / 29)));
    default:
      return baseStride;
  }
}

/** タイル番地を範囲内へループさせるにゃ。 */
function wrapTileAddress(value: number, totalTileCount: number): number {
  const remainder = value % totalTileCount;
  return remainder < 0 ? remainder + totalTileCount : remainder;
}

/** 2つのタイルの平均色差を返すにゃ。 */
function measureTileDistance(left: number[], right: number[]): number {
  let totalDistance = 0;
  const pixelCount = Math.min(left.length, right.length) / 4;

  for (let index = 0; index < Math.min(left.length, right.length); index += 4) {
    totalDistance +=
      Math.abs(left[index] - right[index]) +
      Math.abs(left[index + 1] - right[index + 1]) +
      Math.abs(left[index + 2] - right[index + 2]);
  }

  return pixelCount > 0 ? totalDistance / (pixelCount * 3) : 0;
}

/** 採用されたSprite画像のユニーク8x8タイル数を数えるにゃ。 */
function countUniqueSpriteTiles(
  spriteImage: ImageData,
  selectedTiles: Map<string, SpriteTileCandidate>
): { uniqueTileCount: number; totalTileCount: number } {
  const tileHashes = new Set<string>();

  for (const tile of selectedTiles.values()) {
    const parts = readTilePixels(spriteImage, tile.tileX, tile.tileY);
    tileHashes.add(buildCanonicalSpriteTileHash(parts));
  }

  return {
    uniqueTileCount: tileHashes.size,
    totalTileCount: selectedTiles.size
  };
}

/** Spriteのユニーク8x8タイルを反転再利用込みで番地順シートへ並べるにゃ。 */
function buildSpriteTilePaletteSheet(
  spriteImage: ImageData,
  selectedTiles: Map<string, SpriteTileCandidate>
): FamicomTilePaletteSheet {
  const sortedTiles = [...selectedTiles.values()].sort((left, right) => {
    if (left.tileY !== right.tileY) {
      return left.tileY - right.tileY;
    }
    return left.tileX - right.tileX;
  });
  const entryByHash = new Map<string, { pixels: number[]; usageCount: number }>();
  const orderedEntries: Array<{ pixels: number[]; usageCount: number }> = [];

  for (const tile of sortedTiles) {
    const pixels = readTilePixels(spriteImage, tile.tileX, tile.tileY);
    const hash = buildCanonicalSpriteTileHash(pixels);
    const existing = entryByHash.get(hash);
    if (existing) {
      existing.usageCount += 1;
      continue;
    }

    const entry = {
      pixels,
      usageCount: 1
    };
    entryByHash.set(hash, entry);
    orderedEntries.push(entry);
  }

  return renderTilePaletteSheet(orderedEntries);
}

/** Spriteの類似8x8タイルを反転込みで代表タイルへ寄せるにゃ。 */
function consolidateSpriteTiles(
  spriteImage: ImageData,
  finalPixelData: Uint8ClampedArray,
  finalSpriteMask: Uint8Array,
  selectedTiles: Map<string, SpriteTileCandidate>,
  tuning: ReductionTuning
): void {
  const tileEntries = [...selectedTiles.values()].map((tile) => ({
    tileX: tile.tileX,
    tileY: tile.tileY,
    pixels: readTilePixels(spriteImage, tile.tileX, tile.tileY)
  }));

  const exactUniqueCount = new Set(tileEntries.map((tile) => buildCanonicalSpriteTileHash(tile.pixels))).size;
  if (exactUniqueCount <= FAMICOM_PATTERN_TABLE_TILE_LIMIT) {
    return;
  }

  const representatives: Array<{ canonicalPixels: number[]; usageCount: number }> = [];

  for (const tile of tileEntries) {
    let bestRepresentativeIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    let bestResolvedPixels: number[] | null = null;

    for (let index = 0; index < representatives.length; index += 1) {
      const comparison = measureSpriteTileDistanceWithFlips(tile.pixels, representatives[index].canonicalPixels);
      if (comparison.distance < bestDistance) {
        bestDistance = comparison.distance;
        bestRepresentativeIndex = index;
        bestResolvedPixels = comparison.alignedPixels;
      }
    }

    const canCreateNewRepresentative =
      representatives.length < FAMICOM_PATTERN_TABLE_TILE_LIMIT &&
      (bestRepresentativeIndex === -1 || bestDistance > SPRITE_TILE_MERGE_THRESHOLD_STEPS[tuning.spriteMergeStepIndex]);

    if (canCreateNewRepresentative) {
      representatives.push({
        canonicalPixels: tile.pixels,
        usageCount: 1
      });
      continue;
    }

    const representative = representatives[Math.max(0, bestRepresentativeIndex)];
    representative.usageCount += 1;
    const resolvedPixels = bestResolvedPixels ?? representative.canonicalPixels;
    writeTilePixels(spriteImage, tile.tileX, tile.tileY, resolvedPixels);
    writeTilePixelsToFinal(spriteImage.width, finalPixelData, finalSpriteMask, tile.tileX, tile.tileY, resolvedPixels);
  }
}

/** Spriteタイルを反転込みで同一視するための正規化ハッシュを返すにゃ。 */
function buildCanonicalSpriteTileHash(tilePixels: number[]): string {
  const variants = [
    tilePixels,
    flipTilePixelsHorizontally(tilePixels),
    flipTilePixelsVertically(tilePixels),
    flipTilePixelsVertically(flipTilePixelsHorizontally(tilePixels))
  ];

  let bestHash = "";
  for (const variant of variants) {
    const hash = variant.join(",");
    if (bestHash === "" || hash < bestHash) {
      bestHash = hash;
    }
  }

  return bestHash;
}

/** タイル一覧を番地順シートCanvasへ描き出すにゃ。 */
function renderTilePaletteSheet(entries: Array<{ pixels: number[]; usageCount: number }>): FamicomTilePaletteSheet {
  const canvas = document.createElement("canvas");
  if (entries.length === 0) {
    canvas.width = 1;
    canvas.height = 1;
    return {
      canvas,
      entries: []
    };
  }

  const rowCount = Math.ceil(entries.length / TILE_SHEET_COLUMNS);
  const cellWidth = TILE_SIZE;
  const cellHeight = TILE_SIZE;
  canvas.width = TILE_SHEET_COLUMNS * cellWidth;
  canvas.height = rowCount * cellHeight;

  const context = require2dContext(canvas);
  context.fillStyle = "#111111";
  context.fillRect(0, 0, canvas.width, canvas.height);

  const resultEntries = entries.map((entry, address) => ({
    address,
    usageCount: entry.usageCount
  }));

  for (let index = 0; index < entries.length; index += 1) {
    const column = index % TILE_SHEET_COLUMNS;
    const row = Math.floor(index / TILE_SHEET_COLUMNS);
    const originX = column * cellWidth;
    const originY = row * cellHeight;

    drawTilePixelsToContext(
      context,
      entries[index].pixels,
      originX,
      originY
    );
  }

  return {
    canvas,
    entries: resultEntries
  };
}

/** 8x8タイルRGBAを小さなシートへ描くにゃ。 */
function drawTilePixelsToContext(
  context: CanvasRenderingContext2D,
  pixels: number[],
  originX: number,
  originY: number
): void {
  let sourceIndex = 0;

  for (let y = 0; y < TILE_SIZE; y += 1) {
    for (let x = 0; x < TILE_SIZE; x += 1) {
      const alpha = pixels[sourceIndex + 3] ?? 0;
      if (alpha === 0) {
        context.fillStyle = "#000000";
      } else {
        context.fillStyle = `rgba(${pixels[sourceIndex]}, ${pixels[sourceIndex + 1]}, ${pixels[sourceIndex + 2]}, ${alpha / 255})`;
      }
      context.fillRect(originX + x, originY + y, 1, 1);
      sourceIndex += 4;
    }
  }
}

/** 反転込みで最も近いSpriteタイル距離を返すにゃ。 */
function measureSpriteTileDistanceWithFlips(
  sourcePixels: number[],
  representativePixels: number[]
): { distance: number; alignedPixels: number[] } {
  const variants = [
    representativePixels,
    flipTilePixelsHorizontally(representativePixels),
    flipTilePixelsVertically(representativePixels),
    flipTilePixelsVertically(flipTilePixelsHorizontally(representativePixels))
  ];

  let bestDistance = Number.POSITIVE_INFINITY;
  let bestAlignedPixels = representativePixels;

  for (const variant of variants) {
    const distance = measureTileDistance(sourcePixels, variant);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestAlignedPixels = variant;
    }
  }

  return {
    distance: bestDistance,
    alignedPixels: bestAlignedPixels
  };
}

/** 8x8タイルを左右反転したRGBA配列を返すにゃ。 */
function flipTilePixelsHorizontally(tilePixels: number[]): number[] {
  const flipped = new Array<number>(tilePixels.length);

  for (let y = 0; y < TILE_SIZE; y += 1) {
    for (let x = 0; x < TILE_SIZE; x += 1) {
      const sourceOffset = (y * TILE_SIZE + x) * 4;
      const targetOffset = (y * TILE_SIZE + (TILE_SIZE - 1 - x)) * 4;
      flipped[targetOffset] = tilePixels[sourceOffset];
      flipped[targetOffset + 1] = tilePixels[sourceOffset + 1];
      flipped[targetOffset + 2] = tilePixels[sourceOffset + 2];
      flipped[targetOffset + 3] = tilePixels[sourceOffset + 3];
    }
  }

  return flipped;
}

/** 8x8タイルを上下反転したRGBA配列を返すにゃ。 */
function flipTilePixelsVertically(tilePixels: number[]): number[] {
  const flipped = new Array<number>(tilePixels.length);

  for (let y = 0; y < TILE_SIZE; y += 1) {
    for (let x = 0; x < TILE_SIZE; x += 1) {
      const sourceOffset = (y * TILE_SIZE + x) * 4;
      const targetOffset = ((TILE_SIZE - 1 - y) * TILE_SIZE + x) * 4;
      flipped[targetOffset] = tilePixels[sourceOffset];
      flipped[targetOffset + 1] = tilePixels[sourceOffset + 1];
      flipped[targetOffset + 2] = tilePixels[sourceOffset + 2];
      flipped[targetOffset + 3] = tilePixels[sourceOffset + 3];
    }
  }

  return flipped;
}

/** 実機制限の簡易チェック結果を返すにゃ。 */
function evaluateHardwareLimits(
  bgTileStats: { uniqueTileCount: number; totalTileCount: number },
  spriteTileStats: { uniqueTileCount: number; totalTileCount: number },
  scanlineOverflowCount: number
): { status: "ok" | "warning"; findings: string[] } {
  const findings: string[] = [];

  findings.push(
    bgTileStats.uniqueTileCount > FAMICOM_PATTERN_TABLE_TILE_LIMIT
      ? `BGユニーク8x8タイル数が ${bgTileStats.uniqueTileCount} 枚で、256枚想定を超えているにゃ。`
      : `BGユニーク8x8タイル数は ${bgTileStats.uniqueTileCount} 枚で、256枚想定内にゃ。`
  );
  findings.push(
    spriteTileStats.uniqueTileCount > FAMICOM_PATTERN_TABLE_TILE_LIMIT
      ? `Spriteユニーク8x8タイル数が ${spriteTileStats.uniqueTileCount} 枚で、256枚想定を超えているにゃ。`
      : `Spriteユニーク8x8タイル数は ${spriteTileStats.uniqueTileCount} 枚で、256枚想定内にゃ。`
  );
  findings.push(
    scanlineOverflowCount > 0
      ? `走査線8枚制限に ${scanlineOverflowCount} 行で引っかかっているにゃ。`
      : "走査線8枚制限の概算では超過なしにゃ。"
  );

  const status =
    bgTileStats.uniqueTileCount > FAMICOM_PATTERN_TABLE_TILE_LIMIT ||
    spriteTileStats.uniqueTileCount > FAMICOM_PATTERN_TABLE_TILE_LIMIT ||
    scanlineOverflowCount > 0
      ? "warning"
      : "ok";

  return { status, findings };
}

/** 1回の生成結果から制約違反量を取り出すにゃ。 */
function evaluateReductionViolations(preview: RenderedPreview): ReductionViolations {
  return {
    bgTileOverflow: Math.max(0, preview.uniqueBgTileCount - FAMICOM_PATTERN_TABLE_TILE_LIMIT),
    spriteTileOverflow: Math.max(0, preview.uniqueSpriteTileCount - FAMICOM_PATTERN_TABLE_TILE_LIMIT),
    unresolvedCellCount: preview.unresolvedAttributeCellCount,
    rejectedSpriteCount: preview.rejectedSpriteTiles.length,
    scanlineOverflowCount: preview.scanlineOverflowCount
  };
}

/** まだ制約違反が残っているか返すにゃ。 */
function hasReductionViolations(violations: ReductionViolations): boolean {
  return (
    violations.bgTileOverflow > 0 ||
    violations.spriteTileOverflow > 0 ||
    violations.unresolvedCellCount > 0 ||
    violations.rejectedSpriteCount > 0 ||
    violations.scanlineOverflowCount > 0
  );
}

/** 1反復ぶんの収束統計を作るにゃ。 */
function buildConvergenceStep(preview: RenderedPreview): FamicomConvergenceStep {
  return {
    iteration: preview.convergenceIterations,
    bgUniqueTileCount: preview.uniqueBgTileCount,
    spriteUniqueTileCount: preview.uniqueSpriteTileCount,
    unresolvedAttributeCellCount: preview.unresolvedAttributeCellCount,
    unresolvedPixelCount: preview.unresolvedPixelCount,
    rejectedSpriteCount: preview.rejectedSpriteTiles.length,
    scanlineOverflowCount: preview.scanlineOverflowCount
  };
}

/** 現在の違反内容に応じて締め付けパラメータを1段階だけ進めるにゃ。 */
function tightenReductionTuning(tuning: ReductionTuning, violations: ReductionViolations): boolean {
  if (violations.rejectedSpriteCount > 0 || violations.scanlineOverflowCount > 0) {
    if (tuning.roiBgColorCapacity < 3) {
      tuning.roiBgColorCapacity = 3;
      return true;
    }

    if (tuning.enableRoiSpriteForce) {
      tuning.enableRoiSpriteForce = false;
      return true;
    }

    if (!tuning.allowRoiSpriteCandidateRemoval) {
      tuning.allowRoiSpriteCandidateRemoval = true;
      return true;
    }

    if (tuning.spriteMergeStepIndex < SPRITE_TILE_MERGE_THRESHOLD_STEPS.length - 1) {
      tuning.spriteMergeStepIndex += 1;
      return true;
    }
  }

  if (violations.unresolvedCellCount > 0) {
    if (tuning.bgMergeStepIndex < BG_TILE_MERGE_THRESHOLD_STEPS.length - 1) {
      tuning.bgMergeStepIndex += 1;
      return true;
    }

    if (tuning.spriteMergeStepIndex < SPRITE_TILE_MERGE_THRESHOLD_STEPS.length - 1) {
      tuning.spriteMergeStepIndex += 1;
      return true;
    }
  }

  if (violations.spriteTileOverflow > 0) {
    if (tuning.spriteMergeStepIndex < SPRITE_TILE_MERGE_THRESHOLD_STEPS.length - 1) {
      tuning.spriteMergeStepIndex += 1;
      return true;
    }
  }

  if (violations.bgTileOverflow > 0) {
    if (tuning.bgMergeStepIndex < BG_TILE_MERGE_THRESHOLD_STEPS.length - 1) {
      tuning.bgMergeStepIndex += 1;
      return true;
    }
  }

  return false;
}

/** 採用済みスプライト画素を最終画像へ合成するにゃ。 */
function compositeAcceptedSpritesIntoFinal(
  indexedImage: IndexedImage,
  finalPixelData: Uint8ClampedArray,
  finalSpriteMask: Uint8Array,
  selectedTiles: Map<string, SpriteTileCandidate>,
  spriteClusterAnalyses: Map<string, SpriteClusterAnalysis>,
  spriteSubPalettes: [FamicomSubPalette, FamicomSubPalette, FamicomSubPalette, FamicomSubPalette],
  spritePaletteAssignments: Map<string, number>
): void {
  for (const clusterAnalysis of spriteClusterAnalyses.values()) {
    const paletteIndex = spritePaletteAssignments.get(clusterAnalysis.key) ?? chooseBestSpritePalette(clusterAnalysis.colors, spriteSubPalettes);
    const palette = spriteSubPalettes[paletteIndex];

    for (const tileKey of clusterAnalysis.tileKeys) {
      const tile = selectedTiles.get(tileKey);
      if (!tile) {
        continue;
      }

      const startX = tile.tileX * TILE_SIZE;
      const startY = tile.tileY * TILE_SIZE;
      for (let y = startY; y < Math.min(indexedImage.height, startY + TILE_SIZE); y += 1) {
        for (let x = startX; x < Math.min(indexedImage.width, startX + TILE_SIZE); x += 1) {
          const pixelIndex = y * indexedImage.width + x;
          const colorIndex = indexedImage.pixels[pixelIndex];
          const reducedColor = chooseNearestSpritePaletteColor(colorIndex, palette);
          writePixel(finalPixelData, pixelIndex, FAMICOM_PREVIEW_PALETTE[reducedColor], 255);
          finalSpriteMask[pixelIndex] = 1;
        }
      }
    }
  }
}

/** 採用された8x8スプライトタイルごとの色分布を集計するにゃ。 */
function analyzeSelectedSpriteTiles(
  indexedImage: IndexedImage,
  selectedTiles: Map<string, SpriteTileCandidate>
): Map<string, SpriteTileAnalysis> {
  const analyses = new Map<string, SpriteTileAnalysis>();

  for (const tile of selectedTiles.values()) {
    const weightedFrequencyMap = new Map<number, number>();
    const startX = tile.tileX * TILE_SIZE;
    const startY = tile.tileY * TILE_SIZE;

    for (let y = startY; y < Math.min(indexedImage.height, startY + TILE_SIZE); y += 1) {
      for (let x = startX; x < Math.min(indexedImage.width, startX + TILE_SIZE); x += 1) {
        const pixelIndex = y * indexedImage.width + x;
        const colorIndex = indexedImage.pixels[pixelIndex];
        weightedFrequencyMap.set(colorIndex, (weightedFrequencyMap.get(colorIndex) ?? 0) + 1);
      }
    }

    const topColors = [...weightedFrequencyMap.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, SUB_PALETTE_COLOR_COUNT)
      .map(([color]) => color);

    analyses.set(makeCellKey(tile.tileX, tile.tileY), {
      tileX: tile.tileX,
      tileY: tile.tileY,
      weightedFrequencyMap,
      topColors
    });
  }

  return analyses;
}

/** スプライト候補塊を解析するにゃ。 */
function analyzeSpriteClusters(
  spriteCandidates: Map<string, SpriteTileCandidate>,
  selectedTiles: Map<string, SpriteTileCandidate>,
  spriteTileAnalyses: Map<string, SpriteTileAnalysis>
): Map<string, SpriteClusterAnalysis> {
  const remaining = new Map(spriteCandidates);
  const analyses = new Map<string, SpriteClusterAnalysis>();

  while (remaining.size > 0) {
    const firstEntry = remaining.entries().next().value;
    if (!firstEntry) {
      break;
    }

    const [firstKey] = firstEntry;
    const queue = [firstKey];
    const cluster: SpriteTileCandidate[] = [];

    while (queue.length > 0) {
      const key = queue.shift();
      if (!key) {
        continue;
      }

      const tile = remaining.get(key);
      if (!tile) {
        continue;
      }

      remaining.delete(key);
      cluster.push(tile);

      for (const neighborKey of getNeighborTileKeys(tile.tileX, tile.tileY)) {
        if (remaining.has(neighborKey)) {
          queue.push(neighborKey);
        }
      }
    }

    const weightedFrequencyMap = new Map<number, number>();
    for (const tile of cluster) {
      const tileKey = makeCellKey(tile.tileX, tile.tileY);
      if (!selectedTiles.has(tileKey)) {
        continue;
      }

      const tileAnalysis = spriteTileAnalyses.get(tileKey);
      if (!tileAnalysis) {
        continue;
      }

      for (const [color, weight] of tileAnalysis.weightedFrequencyMap.entries()) {
        weightedFrequencyMap.set(color, (weightedFrequencyMap.get(color) ?? 0) + weight);
      }
    }

    const colors = [...weightedFrequencyMap.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, SUB_PALETTE_COLOR_COUNT)
      .map(([color]) => color);

    analyses.set(firstKey, {
      key: firstKey,
      colors,
      weightedFrequencyMap,
      tileKeys: cluster.map((tile) => makeCellKey(tile.tileX, tile.tileY))
    });
  }

  return analyses;
}

/** スプライト候補塊から4組のスプライトパレット候補を作るにゃ。 */
function buildInitialSpriteSubPalettes(
  spriteClusterAnalyses: Map<string, SpriteClusterAnalysis>
): [FamicomSubPalette, FamicomSubPalette, FamicomSubPalette, FamicomSubPalette] {
  const paletteSeeds = [...spriteClusterAnalyses.values()]
    .sort((left, right) => sumMap(right.weightedFrequencyMap) - sumMap(left.weightedFrequencyMap))
    .slice(0, BG_SUB_PALETTE_COUNT)
    .map((analysis) => fillSubPalette(analysis.colors));

  while (paletteSeeds.length < BG_SUB_PALETTE_COUNT) {
    paletteSeeds.push(fillSubPalette([]));
  }

  return [
    paletteSeeds[0],
    paletteSeeds[1],
    paletteSeeds[2],
    paletteSeeds[3]
  ];
}

/** スプライトパレットを割り当て結果込みで整えるにゃ。 */
function solveSpriteSubPalettes(
  spriteClusterAnalyses: Map<string, SpriteClusterAnalysis>
): [FamicomSubPalette, FamicomSubPalette, FamicomSubPalette, FamicomSubPalette] {
  let spriteSubPalettes = buildInitialSpriteSubPalettes(spriteClusterAnalyses);

  for (let pass = 0; pass < SPRITE_PALETTE_REFINEMENT_PASSES; pass += 1) {
    const assignments = assignSpritePalettes(spriteClusterAnalyses, spriteSubPalettes);
    spriteSubPalettes = rebuildSpriteSubPalettes(spriteClusterAnalyses, assignments);
  }

  return spriteSubPalettes;
}

/** スプライト候補塊へパレット番号を割り当てるにゃ。 */
function assignSpritePalettes(
  spriteClusterAnalyses: Map<string, SpriteClusterAnalysis>,
  spriteSubPalettes: [FamicomSubPalette, FamicomSubPalette, FamicomSubPalette, FamicomSubPalette]
): Map<string, number> {
  const assignments = new Map<string, number>();

  for (const [key, analysis] of spriteClusterAnalyses.entries()) {
    assignments.set(key, chooseBestSpritePalette(analysis.colors, spriteSubPalettes));
  }

  return assignments;
}

/** 割り当て済み候補塊からスプライトパレットを再構築するにゃ。 */
function rebuildSpriteSubPalettes(
  spriteClusterAnalyses: Map<string, SpriteClusterAnalysis>,
  assignments: Map<string, number>
): [FamicomSubPalette, FamicomSubPalette, FamicomSubPalette, FamicomSubPalette] {
  const weightedColorsByPalette = Array.from(
    { length: BG_SUB_PALETTE_COUNT },
    () => new Map<number, number>()
  );

  for (const [key, analysis] of spriteClusterAnalyses.entries()) {
    const paletteIndex = assignments.get(key);
    if (paletteIndex === undefined) {
      continue;
    }

    const bucket = weightedColorsByPalette[paletteIndex];
    for (const [color, weight] of analysis.weightedFrequencyMap.entries()) {
      bucket.set(color, (bucket.get(color) ?? 0) + weight);
    }
  }

  const rebuilt = weightedColorsByPalette.map((bucket) => {
    const colors = [...bucket.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, SUB_PALETTE_COLOR_COUNT)
      .map(([color]) => color);
    return fillSubPalette(colors);
  });

  return [rebuilt[0], rebuilt[1], rebuilt[2], rebuilt[3]];
}

/** スプライト候補を集めるにゃ。 */
function collectSpriteCandidate(
  spriteCandidates: Map<string, SpriteTileCandidate>,
  x: number,
  y: number,
  overlapsRoi: boolean
): void {
  const tileX = Math.floor(x / TILE_SIZE);
  const tileY = Math.floor(y / TILE_SIZE);
  const key = `${tileX}:${tileY}`;
  const existing = spriteCandidates.get(key);
  if (existing) {
    existing.pixelCount += 1;
    existing.overlapsRoi = existing.overlapsRoi || overlapsRoi;
    return;
  }

  spriteCandidates.set(key, {
    tileX,
    tileY,
    pixelCount: 1,
    overlapsRoi
  });
}

/** 8x8スプライト候補を走査線制限に合わせて採用するにゃ。 */
function selectSpriteTiles(
  imageHeight: number,
  spriteCandidates: Map<string, SpriteTileCandidate>
): SpriteSelectionResult {
  const sortedTiles = [...spriteCandidates.entries()].sort((left, right) => right[1].pixelCount - left[1].pixelCount);
  const roiTiles = sortedTiles.filter((entry) => entry[1].overlapsRoi);
  const nonRoiTiles = sortedTiles.filter((entry) => !entry[1].overlapsRoi);
  const scanlineCounts = new Uint16Array(imageHeight);
  const selectedTiles = new Map<string, SpriteTileCandidate>();
  const rejectedTiles = new Map<string, SpriteTileCandidate>();
  let scanlineOverflowCount = 0;

  selectSpriteTilesIntoBuckets(roiTiles, imageHeight, scanlineCounts, selectedTiles, rejectedTiles);
  selectSpriteTilesIntoBuckets(nonRoiTiles, imageHeight, scanlineCounts, selectedTiles, rejectedTiles);

  for (const [key, tile] of roiTiles) {
    if (!selectedTiles.has(key) && !rejectedTiles.has(key)) {
      rejectedTiles.set(key, tile);
    }
  }

  for (const [key, tile] of nonRoiTiles) {
    if (!selectedTiles.has(key) && !rejectedTiles.has(key)) {
      rejectedTiles.set(key, tile);
    }
  }

  for (const count of scanlineCounts) {
    if (count > SCANLINE_SPRITE_LIMIT) {
      scanlineOverflowCount += 1;
    }
  }

  return {
    selectedTiles,
    rejectedTiles,
    scanlineOverflowCount
  };
}

/** 指定候補群を現在の走査線空き状況に従って採用するにゃ。 */
function selectSpriteTilesIntoBuckets(
  tiles: Array<[string, SpriteTileCandidate]>,
  imageHeight: number,
  scanlineCounts: Uint16Array,
  selectedTiles: Map<string, SpriteTileCandidate>,
  rejectedTiles: Map<string, SpriteTileCandidate>
): void {
  for (const [key, tile] of tiles) {
    const startY = tile.tileY * TILE_SIZE;
    const endY = Math.min(imageHeight, startY + TILE_SIZE);
    let canSelect = true;

    for (let y = startY; y < endY; y += 1) {
      if (scanlineCounts[y] >= SCANLINE_SPRITE_LIMIT) {
        canSelect = false;
        break;
      }
    }

    if (!canSelect) {
      rejectedTiles.set(key, tile);
      continue;
    }

    selectedTiles.set(key, tile);
    for (let y = startY; y < endY; y += 1) {
        scanlineCounts[y] += 1;
    }
  }
}

/** 採用済みスプライト画素を割り当てパレット色へ丸め直すにゃ。 */
function recolorAcceptedSpritePixels(
  indexedImage: IndexedImage,
  spritePixelData: Uint8ClampedArray,
  selectedTiles: Map<string, SpriteTileCandidate>,
  spriteClusterAnalyses: Map<string, SpriteClusterAnalysis>,
  spriteSubPalettes: [FamicomSubPalette, FamicomSubPalette, FamicomSubPalette, FamicomSubPalette],
  spritePaletteAssignments: Map<string, number>
): void {
  for (const clusterAnalysis of spriteClusterAnalyses.values()) {
    const paletteIndex = spritePaletteAssignments.get(clusterAnalysis.key) ?? chooseBestSpritePalette(clusterAnalysis.colors, spriteSubPalettes);
    const palette = spriteSubPalettes[paletteIndex];

    for (const tileKey of clusterAnalysis.tileKeys) {
      const tile = selectedTiles.get(tileKey);
      if (!tile) {
        continue;
      }

      const startX = tile.tileX * TILE_SIZE;
      const startY = tile.tileY * TILE_SIZE;
      for (let y = startY; y < Math.min(indexedImage.height, startY + TILE_SIZE); y += 1) {
        for (let x = startX; x < Math.min(indexedImage.width, startX + TILE_SIZE); x += 1) {
          const pixelIndex = y * indexedImage.width + x;
          const colorIndex = indexedImage.pixels[pixelIndex];
          const reducedColor = chooseNearestSpritePaletteColor(colorIndex, palette);
          writePixel(spritePixelData, pixelIndex, FAMICOM_PREVIEW_PALETTE[reducedColor], 255);
        }
      }
    }
  }
}

/** 採用されなかったSprite候補画素を黒で消すにゃ。 */
function clearNonSelectedSpritePixels(
  indexedImage: IndexedImage,
  spritePixelData: Uint8ClampedArray,
  selectedTiles: Map<string, SpriteTileCandidate>
): void {
  for (let tileY = 0; tileY < Math.ceil(indexedImage.height / TILE_SIZE); tileY += 1) {
    for (let tileX = 0; tileX < Math.ceil(indexedImage.width / TILE_SIZE); tileX += 1) {
      if (selectedTiles.has(makeCellKey(tileX, tileY))) {
        continue;
      }

      for (let y = tileY * TILE_SIZE; y < Math.min(indexedImage.height, (tileY + 1) * TILE_SIZE); y += 1) {
        for (let x = tileX * TILE_SIZE; x < Math.min(indexedImage.width, (tileX + 1) * TILE_SIZE); x += 1) {
          writePixel(spritePixelData, y * indexedImage.width + x, UNUSED_PREVIEW_PIXEL, 255);
        }
      }
    }
  }
}

/** 隣接不足タイルをまとめてスプライト候補一覧へ変換するにゃ。 */
function buildGroupedSpriteCandidates(
  spriteCandidates: Map<string, SpriteTileCandidate>,
  selectedTiles: Map<string, SpriteTileCandidate>,
  spriteClusterAnalyses: Map<string, SpriteClusterAnalysis>,
  spriteSubPalettes: [FamicomSubPalette, FamicomSubPalette, FamicomSubPalette, FamicomSubPalette]
): FamicomSpriteCandidate[] {
  const remaining = new Map(spriteCandidates);
  const groupedCandidates: FamicomSpriteCandidate[] = [];

  while (remaining.size > 0) {
    const firstEntry = remaining.entries().next().value;
    if (!firstEntry) {
      break;
    }

    const [firstKey] = firstEntry;
    const queue = [firstKey];
    const cluster: SpriteTileCandidate[] = [];

    while (queue.length > 0) {
      const key = queue.shift();
      if (!key) {
        continue;
      }

      const tile = remaining.get(key);
      if (!tile) {
        continue;
      }

      remaining.delete(key);
      cluster.push(tile);

      for (const neighborKey of getNeighborTileKeys(tile.tileX, tile.tileY)) {
        if (remaining.has(neighborKey)) {
          queue.push(neighborKey);
        }
      }
    }

    groupedCandidates.push(createSpriteCandidateFromCluster(cluster, selectedTiles, spriteClusterAnalyses, spriteSubPalettes));
  }

  return groupedCandidates.sort((left, right) => {
    if (left.overlapsRoi !== right.overlapsRoi) {
      return left.overlapsRoi ? -1 : 1;
    }
    if (left.pixelCount !== right.pixelCount) {
      return right.pixelCount - left.pixelCount;
    }
    return right.tileCount - left.tileCount;
  });
}

/** クラスタ化したタイル群から1件のスプライト候補を作るにゃ。 */
function createSpriteCandidateFromCluster(
  cluster: SpriteTileCandidate[],
  selectedTiles: Map<string, SpriteTileCandidate>,
  spriteClusterAnalyses: Map<string, SpriteClusterAnalysis>,
  spriteSubPalettes: [FamicomSubPalette, FamicomSubPalette, FamicomSubPalette, FamicomSubPalette]
): FamicomSpriteCandidate {
  let minTileX = Number.POSITIVE_INFINITY;
  let minTileY = Number.POSITIVE_INFINITY;
  let maxTileX = Number.NEGATIVE_INFINITY;
  let maxTileY = Number.NEGATIVE_INFINITY;
  let pixelCount = 0;
  let overlapsRoi = false;
  let selectedTileCount = 0;
  let clusterKey = "";

  for (const tile of cluster) {
    minTileX = Math.min(minTileX, tile.tileX);
    minTileY = Math.min(minTileY, tile.tileY);
    maxTileX = Math.max(maxTileX, tile.tileX);
    maxTileY = Math.max(maxTileY, tile.tileY);
    pixelCount += tile.pixelCount;
    overlapsRoi = overlapsRoi || tile.overlapsRoi;
    if (!clusterKey) {
      clusterKey = makeCellKey(tile.tileX, tile.tileY);
    }
    if (selectedTiles.has(makeCellKey(tile.tileX, tile.tileY))) {
      selectedTileCount += 1;
    }
  }

  const clusterAnalysis = spriteClusterAnalyses.get(clusterKey);
  const spriteColors = clusterAnalysis?.colors ?? [];
  const spritePaletteIndex = selectedTileCount > 0
    ? chooseBestSpritePalette(spriteColors, spriteSubPalettes)
    : null;

  return {
    tileX: minTileX,
    tileY: minTileY,
    widthTiles: maxTileX - minTileX + 1,
    heightTiles: maxTileY - minTileY + 1,
    pixelCount,
    tileCount: cluster.length,
    spriteCount: selectedTileCount,
    overlapsRoi,
    accepted: selectedTileCount > 0,
    rejectedTileCount: cluster.length - selectedTileCount,
    spritePaletteIndex,
    spriteColors
  };
}

/** 候補色に最も近いスプライトパレット番号を返すにゃ。 */
function chooseBestSpritePalette(
  spriteColors: number[],
  spriteSubPalettes: [FamicomSubPalette, FamicomSubPalette, FamicomSubPalette, FamicomSubPalette]
): number {
  let bestPaletteIndex = 0;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let paletteIndex = 0; paletteIndex < spriteSubPalettes.length; paletteIndex += 1) {
    const palette = spriteSubPalettes[paletteIndex];
    let score = 0;

    for (const color of spriteColors) {
      if (!palette.includes(color)) {
        score += 1;
      }
    }

    if (score < bestScore) {
      bestScore = score;
      bestPaletteIndex = paletteIndex;
    }
  }

  return bestPaletteIndex;
}

/** スプライト用パレット色へ最近傍で丸めるにゃ。 */
function chooseNearestSpritePaletteColor(colorIndex: number, subPalette: FamicomSubPalette): number {
  const sourceColor = FAMICOM_PREVIEW_PALETTE[colorIndex];
  let bestIndex = subPalette[0];
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidateIndex of subPalette) {
    const candidate = FAMICOM_PREVIEW_PALETTE[candidateIndex];
    const distance =
      (sourceColor[0] - candidate[0]) ** 2 +
      (sourceColor[1] - candidate[1]) ** 2 +
      (sourceColor[2] - candidate[2]) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = candidateIndex;
    }
  }

  return bestIndex;
}

/** 隣接4方向のタイルキーを返すにゃ。 */
function getNeighborTileKeys(tileX: number, tileY: number): string[] {
  return [
    `${tileX - 1}:${tileY}`,
    `${tileX + 1}:${tileY}`,
    `${tileX}:${tileY - 1}`,
    `${tileX}:${tileY + 1}`
  ];
}

/** 近いパレット色番号を返すにゃ。 */
function reduceToNearestPaletteIndex(red: number, green: number, blue: number, mode: QuantizationMode): number {
  let bestIndex = EFFECTIVE_FAMICOM_PALETTE_INDICES[0] ?? DEFAULT_BACKGROUND_COLOR;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const index of EFFECTIVE_FAMICOM_PALETTE_INDICES) {
    const candidate = FAMICOM_PREVIEW_PALETTE[index];
    const distance = mode === "luma-weighted"
      ? calculateLumaWeightedDistance(red, green, blue, candidate)
      : calculateRgbDistance(red, green, blue, candidate);

    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }

  return bestIndex;
}

/** 実用上の有効ファミコン色番号一覧を返すにゃ。 */
function buildEffectiveFamicomPaletteIndices(): number[] {
  const seenColors = new Set<string>();
  const indices: number[] = [];

  for (let index = 0; index < FAMICOM_PREVIEW_PALETTE.length; index += 1) {
    if (index === FORBIDDEN_COLOR_INDEX || EXCLUDED_EFFECTIVE_FAMICOM_COLOR_INDICES.has(index)) {
      continue;
    }

    const color = FAMICOM_PREVIEW_PALETTE[index];
    const key = `${color[0]},${color[1]},${color[2]}`;
    if (seenColors.has(key)) {
      continue;
    }

    seenColors.add(key);
    indices.push(index);
  }

  return indices;
}

/** 入力色へ明度・コントラスト・彩度を適用するにゃ。 */
function adjustSourceColor(
  red: number,
  green: number,
  blue: number,
  options: ReductionOptions
): [number, number, number] {
  const brightnessOffset = options.brightness * 1.28;
  const contrastFactor = (259 * (options.contrast + 255)) / (255 * (259 - options.contrast));
  const saturationFactor = 1 + options.saturation / 100;

  let adjustedRed = applyContrast(red + brightnessOffset, contrastFactor);
  let adjustedGreen = applyContrast(green + brightnessOffset, contrastFactor);
  let adjustedBlue = applyContrast(blue + brightnessOffset, contrastFactor);

  const luminance = adjustedRed * 0.299 + adjustedGreen * 0.587 + adjustedBlue * 0.114;
  adjustedRed = clampColor(luminance + (adjustedRed - luminance) * saturationFactor);
  adjustedGreen = clampColor(luminance + (adjustedGreen - luminance) * saturationFactor);
  adjustedBlue = clampColor(luminance + (adjustedBlue - luminance) * saturationFactor);

  return [adjustedRed, adjustedGreen, adjustedBlue];
}

/** RGB最近傍用の距離を返すにゃ。 */
function calculateRgbDistance(
  red: number,
  green: number,
  blue: number,
  candidate: readonly [number, number, number]
): number {
  return (red - candidate[0]) ** 2 + (green - candidate[1]) ** 2 + (blue - candidate[2]) ** 2;
}

/** 明度重み付き距離を返すにゃ。 */
function calculateLumaWeightedDistance(
  red: number,
  green: number,
  blue: number,
  candidate: readonly [number, number, number]
): number {
  const rgbDistance = calculateRgbDistance(red, green, blue, candidate);
  const sourceLuma = red * 0.299 + green * 0.587 + blue * 0.114;
  const candidateLuma = candidate[0] * 0.299 + candidate[1] * 0.587 + candidate[2] * 0.114;
  const lumaDistance = (sourceLuma - candidateLuma) ** 2;
  return rgbDistance * 0.6 + lumaDistance * 0.4;
}

/** コントラスト係数を1色へ適用するにゃ。 */
function applyContrast(value: number, contrastFactor: number): number {
  return clampColor(contrastFactor * (value - 128) + 128);
}

/** 色成分を0-255へ収めるにゃ。 */
function clampColor(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

/** 使用可能色へ最近傍で丸めるにゃ。 */
function chooseNearestAllowedColor(colorIndex: number, universalColor: number, subPalette: FamicomSubPalette): number {
  const allowed = [universalColor, ...subPalette];
  const sourceColor = FAMICOM_PREVIEW_PALETTE[colorIndex];
  let bestIndex = allowed[0];
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidateIndex of allowed) {
    const candidate = FAMICOM_PREVIEW_PALETTE[candidateIndex];
    const distance =
      (sourceColor[0] - candidate[0]) ** 2 +
      (sourceColor[1] - candidate[1]) ** 2 +
      (sourceColor[2] - candidate[2]) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = candidateIndex;
    }
  }

  return bestIndex;
}

/** サブパレットを3色へ整えるにゃ。 */
function fillSubPalette(colors: number[]): FamicomSubPalette {
  const normalized = [...new Set(colors.filter((color) => color !== FORBIDDEN_COLOR_INDEX))].slice(0, SUB_PALETTE_COLOR_COUNT);
  while (normalized.length < SUB_PALETTE_COLOR_COUNT) {
    normalized.push(normalized[normalized.length - 1] ?? DEFAULT_BACKGROUND_COLOR);
  }
  return [normalized[0], normalized[1], normalized[2]];
}

/** 現在のサブパレットで使える色集合を返すにゃ。 */
function getAllowedColors(universalColor: number, subPalette: FamicomSubPalette): Set<number> {
  return new Set([universalColor, ...subPalette]);
}

/** Map内の最大頻度色を返すにゃ。 */
function getMostFrequentColor(frequencyMap: Map<number, number>, fallback: number): number {
  let bestColor = fallback;
  let bestCount = -1;

  for (const [color, count] of frequencyMap.entries()) {
    if (count > bestCount) {
      bestColor = color;
      bestCount = count;
    }
  }

  return bestColor;
}

/** ROI内かどうかを返すにゃ。 */
function isInsideRoi(x: number, y: number, roi: RegionOfInterest): boolean {
  return x >= roi.x && x < roi.x + roi.width && y >= roi.y && y < roi.y + roi.height;
}

/** Canvas2Dコンテキストを取得するにゃ。 */
function require2dContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2Dコンテキストの取得に失敗したにゃ。");
  }
  return context;
}

/** ImageDataへ1画素を書き込むにゃ。 */
function writePixel(
  data: Uint8ClampedArray,
  pixelIndex: number,
  color: readonly [number, number, number],
  alpha: number
): void {
  const offset = pixelIndex * 4;
  data[offset] = color[0];
  data[offset + 1] = color[1];
  data[offset + 2] = color[2];
  data[offset + 3] = alpha;
}

/** 属性セル用のキーを返すにゃ。 */
function makeCellKey(cellX: number, cellY: number): string {
  return `${cellX}:${cellY}`;
}

/** Map値の合計を返すにゃ。 */
function sumMap(valueMap: Map<number, number>): number {
  let total = 0;
  for (const value of valueMap.values()) {
    total += value;
  }
  return total;
}
