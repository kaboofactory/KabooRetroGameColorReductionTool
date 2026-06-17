/** 機種プロファイルを表す型にゃ。 */
export interface MachineProfile {
  id: "famicom";
  label: "ファミリーコンピュータ";
  notes: string;
}

/** 画像上で扱う単一ROIを表す型にゃ。 */
export interface RegionOfInterest {
  x: number;
  y: number;
  width: number;
  height: number;
  detailWeight: number;
  enabled: boolean;
}

/** 入力中の状態を表す型にゃ。 */
export interface InputState {
  mode: "idle" | "creating-roi" | "moving-roi" | "resizing-roi";
  activePointerId: number | null;
  activeHandle: RoiHandle | null;
  startImageX: number;
  startImageY: number;
  originRoi: RegionOfInterest | null;
}

/** ROIのリサイズハンドルを表す型にゃ。 */
export type RoiHandle =
  | "nw"
  | "ne"
  | "sw"
  | "se"
  | "n"
  | "e"
  | "s"
  | "w";

/** アプリ全体の状態を表す型にゃ。 */
export interface AppState {
  sourceImage: HTMLImageElement | null;
  sourceCanvas: HTMLCanvasElement;
  reducedCanvas: HTMLCanvasElement;
  bgCanvas: HTMLCanvasElement;
  spriteCanvas: HTMLCanvasElement;
  roi: RegionOfInterest | null;
  roiEnabled: boolean;
  glitchPreviewEnabled: boolean;
  detailWeight: number;
  brightness: number;
  contrast: number;
  saturation: number;
  quantizationMode: QuantizationMode;
  famicomAnalysis: FamicomAnalysis | null;
  viewMode: "final" | "bg" | "bg0" | "bg1" | "bg2" | "bg3" | "sprite" | "source";
  showRoiOverlay: boolean;
}

/** 64色量子化の距離計算モードにゃ。 */
export type QuantizationMode = "rgb-nearest" | "luma-weighted";

/** ファミコンのBGサブパレットを表す型にゃ。 */
export type FamicomSubPalette = [number, number, number];

/** 属性セル単位の割り当て情報にゃ。 */
export interface FamicomAttributeCell {
  cellX: number;
  cellY: number;
  paletteIndex: number;
  topColors: number[];
  supportedColors: number[];
  missingPixelCount: number;
  weightedScore: number;
  overlapsRoi: boolean;
  renderedBySpritePixelCount: number;
  unresolvedPixelCount: number;
}

/** スプライト候補タイルを表す型にゃ。 */
export interface FamicomSpriteCandidate {
  tileX: number;
  tileY: number;
  widthTiles: number;
  heightTiles: number;
  pixelCount: number;
  tileCount: number;
  spriteCount: number;
  overlapsRoi: boolean;
  accepted: boolean;
  rejectedTileCount: number;
  spritePaletteIndex: number | null;
  spriteColors: number[];
}

/** 番地順に並べたタイル一覧1件ぶんの情報にゃ。 */
export interface FamicomTilePaletteEntry {
  address: number;
  usageCount: number;
}

/** タイルパレット一覧表示用データにゃ。 */
export interface FamicomTilePaletteSheet {
  canvas: HTMLCanvasElement;
  entries: FamicomTilePaletteEntry[];
}

/** 収束反復1回ぶんの統計にゃ。 */
export interface FamicomConvergenceStep {
  iteration: number;
  bgUniqueTileCount: number;
  spriteUniqueTileCount: number;
  unresolvedAttributeCellCount: number;
  unresolvedPixelCount: number;
  rejectedSpriteCount: number;
  scanlineOverflowCount: number;
}

/** ファミコン解析結果を表す型にゃ。 */
export interface FamicomAnalysis {
  universalColor: number;
  bgSubPalettes: [FamicomSubPalette, FamicomSubPalette, FamicomSubPalette, FamicomSubPalette];
  spriteSubPalettes: [FamicomSubPalette, FamicomSubPalette, FamicomSubPalette, FamicomSubPalette];
  attributeCells: FamicomAttributeCell[];
  spriteCandidates: FamicomSpriteCandidate[];
  scanlineOverflowCount: number;
  acceptedSpriteTiles: Array<{ tileX: number; tileY: number }>;
  rejectedSpriteTiles: Array<{ tileX: number; tileY: number }>;
  uniqueBgTileCount: number;
  totalBgTileCount: number;
  uniqueSpriteTileCount: number;
  totalSpriteTileCount: number;
  convergenceIterations: number;
  convergenceHistory: FamicomConvergenceStep[];
  bgTilePaletteSheet: FamicomTilePaletteSheet;
  spriteTilePaletteSheet: FamicomTilePaletteSheet;
  hardwareStatus: "ok" | "warning";
  hardwareFindings: string[];
}
