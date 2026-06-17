import "./style.css";
import { getImageFileFromPasteEvent, loadImageFromFile, readImageFileFromClipboardApi } from "./image-loader";
import { getMachineProfile } from "./machines";
import { reduceFamicomImage } from "./reducer";
import { RoiManager } from "./roi-manager";
import type { AppState, FamicomSubPalette, QuantizationMode, RegionOfInterest } from "./types";

const FAMICOM_SCREEN_WIDTH = 256;
const FAMICOM_SCREEN_HEIGHT = 240;
const UNUSED_PREVIEW_COLOR = "#ff00c8";
const FAMICOM_DISPLAY_PALETTE: ReadonlyArray<readonly [number, number, number]> = [
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
] as const;

/** アプリ本体を構築するにゃ。 */
export function bootstrapApp(rootElement: HTMLElement): void {
  const state = createInitialState();
  const roiManager = new RoiManager();

  rootElement.innerHTML = createAppMarkup();
  const elements = queryElements(rootElement);
  bindEvents(elements, state, roiManager);
  renderAll(elements, state);
}

/** アプリ初期状態を生成するにゃ。 */
function createInitialState(): AppState {
  return {
    sourceImage: null,
    sourceCanvas: document.createElement("canvas"),
    reducedCanvas: document.createElement("canvas"),
    bgCanvas: document.createElement("canvas"),
    spriteCanvas: document.createElement("canvas"),
    roi: null,
    roiEnabled: true,
    glitchPreviewEnabled: false,
    detailWeight: 2,
    brightness: 0,
    contrast: 0,
    saturation: 0,
    quantizationMode: "luma-weighted",
    famicomAnalysis: null,
    viewMode: "final",
    showRoiOverlay: false
  };
}

/** アプリの静的なHTMLを生成するにゃ。 */
function createAppMarkup(): string {
  return `
    <div class="app-shell">
      <header class="app-header">
        <div>
          <p class="eyebrow">Kaboo Retro Game Color Reduction Tool</p>
          <h1>画像をファミコン風に変換するにゃ。</h1>
          <p class="danger-note">ファミコンハードウェア仕様有識者は使用厳禁！！</p>
        </div>
      </header>

      <section class="card">
        <h2>設定</h2>
        <div class="stack">
          <label class="field">
            <span>画像ファイル</span>
            <input id="fileInput" type="file" accept="image/*" />
          </label>
          <p class="hint">画像は Ctrl+V でも貼り付けできるにゃ。</p>
          <p id="machineNote" class="hint"></p>
          <label class="field">
            <span>ROIのディテール優先度</span>
            <input id="detailWeightInput" type="range" min="1" max="4" step="0.5" value="2" />
          </label>
          <p class="hint">ROIは「この範囲をできるだけ細かく残したい」という優先範囲にゃ。ROI内は BG / Sprite の配分でディテールを優先しやすくなるにゃ。</p>
          <label class="field">
            <span>明度</span>
            <input id="brightnessInput" type="range" min="-100" max="100" step="1" value="0" />
          </label>
          <label class="field">
            <span>コントラスト</span>
            <input id="contrastInput" type="range" min="-100" max="100" step="1" value="0" />
          </label>
          <label class="field">
            <span>彩度</span>
            <input id="saturationInput" type="range" min="-100" max="100" step="1" value="0" />
          </label>
          <label class="field">
            <span>64色減色アルゴリズム</span>
            <select id="quantizationModeInput">
              <option value="rgb-nearest">RGB Nearest</option>
              <option value="luma-weighted" selected>Luma Weighted</option>
            </select>
          </label>
          <div class="inline-row">
            <label class="checkbox">
              <input id="roiEnabledInput" type="checkbox" checked />
              <span>ROIを有効にする</span>
            </label>
            <label class="checkbox">
              <input id="glitchPreviewEnabledInput" type="checkbox" />
              <span>バグ画像再現</span>
            </label>
            <button id="clearRoiButton" class="secondary-button" type="button">ROIクリア</button>
          </div>
          <div class="inline-row">
            <button id="recalculateButton" class="primary-button" type="button">生成</button>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="canvas-toolbar">
          <div class="view-tabs" role="tablist" aria-label="表示切替">
            <button id="viewFinalButton" class="tab-button is-active" type="button">最終画像</button>
            <button id="viewBg0Button" class="tab-button" type="button">BG0</button>
            <button id="viewBg1Button" class="tab-button" type="button">BG1</button>
            <button id="viewBg2Button" class="tab-button" type="button">BG2</button>
            <button id="viewBg3Button" class="tab-button" type="button">BG3</button>
            <button id="viewSpriteButton" class="tab-button" type="button">Sprite</button>
            <button id="viewSourceButton" class="tab-button" type="button">元画像</button>
          </div>
        </div>
        <div id="canvasFrame" class="canvas-frame">
          <canvas id="previewCanvas"></canvas>
          <div id="emptyState" class="empty-state">画像を読み込んでにゃ</div>
        </div>
        <div class="inline-row" style="margin-top: 12px;">
          <button id="saveFinalButton" class="secondary-button" type="button">最終画像を保存</button>
          <button id="saveBgButton" class="secondary-button" type="button">BG画像を保存</button>
          <button id="saveSpriteButton" class="secondary-button" type="button">Sprite画像を保存</button>
        </div>
        <p class="hint">画像上をドラッグすると、ROIを1つだけ指定できるにゃ。ROIはタイル単位に丸められ、その範囲はできるだけディテールを残す方向で変換するにゃ。最終画像は BG と採用Sprite を合成した実用プレビューにゃ。</p>
      </section>

      <section class="card">
        <h2>結果</h2>
        <details open>
          <summary>ROI統計</summary>
          <div id="roiStats"></div>
        </details>
        <details open>
          <summary>BGパレット</summary>
          <div id="bgPaletteInfo"></div>
        </details>
        <details open>
          <summary>スプライト候補</summary>
          <div id="spriteInfo"></div>
        </details>
        <details open>
          <summary>制約警告</summary>
          <div id="warningInfo"></div>
        </details>
        <details open>
          <summary>BGタイルパレット</summary>
          <div id="bgTilePaletteInfo"></div>
        </details>
        <details open>
          <summary>Spriteタイルパレット</summary>
          <div id="spriteTilePaletteInfo"></div>
        </details>
      </section>
    </div>
  `;
}

/** 必要なDOM要素を集めるにゃ。 */
function queryElements(rootElement: HTMLElement) {
  return {
    fileInput: requireElement<HTMLInputElement>(rootElement, "#fileInput"),
    detailWeightInput: requireElement<HTMLInputElement>(rootElement, "#detailWeightInput"),
    brightnessInput: requireElement<HTMLInputElement>(rootElement, "#brightnessInput"),
    contrastInput: requireElement<HTMLInputElement>(rootElement, "#contrastInput"),
    saturationInput: requireElement<HTMLInputElement>(rootElement, "#saturationInput"),
    quantizationModeInput: requireElement<HTMLSelectElement>(rootElement, "#quantizationModeInput"),
    roiEnabledInput: requireElement<HTMLInputElement>(rootElement, "#roiEnabledInput"),
    glitchPreviewEnabledInput: requireElement<HTMLInputElement>(rootElement, "#glitchPreviewEnabledInput"),
    clearRoiButton: requireElement<HTMLButtonElement>(rootElement, "#clearRoiButton"),
    saveFinalButton: requireElement<HTMLButtonElement>(rootElement, "#saveFinalButton"),
    saveBgButton: requireElement<HTMLButtonElement>(rootElement, "#saveBgButton"),
    saveSpriteButton: requireElement<HTMLButtonElement>(rootElement, "#saveSpriteButton"),
    recalculateButton: requireElement<HTMLButtonElement>(rootElement, "#recalculateButton"),
    viewFinalButton: requireElement<HTMLButtonElement>(rootElement, "#viewFinalButton"),
    viewBg0Button: requireElement<HTMLButtonElement>(rootElement, "#viewBg0Button"),
    viewBg1Button: requireElement<HTMLButtonElement>(rootElement, "#viewBg1Button"),
    viewBg2Button: requireElement<HTMLButtonElement>(rootElement, "#viewBg2Button"),
    viewBg3Button: requireElement<HTMLButtonElement>(rootElement, "#viewBg3Button"),
    viewSpriteButton: requireElement<HTMLButtonElement>(rootElement, "#viewSpriteButton"),
    viewSourceButton: requireElement<HTMLButtonElement>(rootElement, "#viewSourceButton"),
    machineNote: requireElement<HTMLParagraphElement>(rootElement, "#machineNote"),
    previewCanvas: requireElement<HTMLCanvasElement>(rootElement, "#previewCanvas"),
    emptyState: requireElement<HTMLDivElement>(rootElement, "#emptyState"),
    roiStats: requireElement<HTMLDivElement>(rootElement, "#roiStats"),
    bgPaletteInfo: requireElement<HTMLDivElement>(rootElement, "#bgPaletteInfo"),
    spriteInfo: requireElement<HTMLDivElement>(rootElement, "#spriteInfo"),
    warningInfo: requireElement<HTMLDivElement>(rootElement, "#warningInfo"),
    bgTilePaletteInfo: requireElement<HTMLDivElement>(rootElement, "#bgTilePaletteInfo"),
    spriteTilePaletteInfo: requireElement<HTMLDivElement>(rootElement, "#spriteTilePaletteInfo")
  };
}

/** DOMイベントを束ねるにゃ。 */
function bindEvents(
  elements: ReturnType<typeof queryElements>,
  state: AppState,
  roiManager: RoiManager
): void {
  elements.fileInput.addEventListener("change", async () => {
    const file = elements.fileInput.files?.[0];
    if (!file) {
      return;
    }
    await updateSourceImage(file, state, elements);
  });

  document.addEventListener("paste", async (event) => {
    const imageFile = getImageFileFromPasteEvent(event) ?? await readImageFileFromClipboardApi();
    if (!imageFile) {
      return;
    }

    event.preventDefault();
    await updateSourceImage(imageFile, state, elements);
    rerenderReduction(state);
    renderAll(elements, state);
  });

  elements.detailWeightInput.addEventListener("input", () => {
    state.detailWeight = Number(elements.detailWeightInput.value);
    if (state.roi) {
      state.roi.detailWeight = state.detailWeight;
    }
    renderAll(elements, state);
  });

  elements.brightnessInput.addEventListener("input", () => {
    state.brightness = Number(elements.brightnessInput.value);
    renderAll(elements, state);
  });

  elements.contrastInput.addEventListener("input", () => {
    state.contrast = Number(elements.contrastInput.value);
    renderAll(elements, state);
  });

  elements.saturationInput.addEventListener("input", () => {
    state.saturation = Number(elements.saturationInput.value);
    renderAll(elements, state);
  });

  elements.quantizationModeInput.addEventListener("change", () => {
    state.quantizationMode = elements.quantizationModeInput.value as QuantizationMode;
    renderAll(elements, state);
  });

  elements.roiEnabledInput.addEventListener("change", () => {
    state.roiEnabled = elements.roiEnabledInput.checked;
    if (state.roi) {
      state.roi.enabled = state.roiEnabled;
    }
    renderAll(elements, state);
  });

  elements.glitchPreviewEnabledInput.addEventListener("change", () => {
    state.glitchPreviewEnabled = elements.glitchPreviewEnabledInput.checked;
    renderAll(elements, state);
  });

  elements.clearRoiButton.addEventListener("click", () => {
    state.roi = null;
    state.showRoiOverlay = false;
    renderAll(elements, state);
  });

  elements.recalculateButton.addEventListener("click", () => {
    rerenderReduction(state);
    renderAll(elements, state);
  });

  elements.saveFinalButton.addEventListener("click", () => {
    saveCanvasImage(state.reducedCanvas, "famicom-final.png");
  });
  elements.saveBgButton.addEventListener("click", () => {
    saveCanvasImage(state.bgCanvas, "famicom-bg.png");
  });
  elements.saveSpriteButton.addEventListener("click", () => {
    saveCanvasImage(state.spriteCanvas, "famicom-sprite.png");
  });

  elements.viewFinalButton.addEventListener("click", () => switchViewMode("final", elements, state));
  elements.viewBg0Button.addEventListener("click", () => switchViewMode("bg0", elements, state));
  elements.viewBg1Button.addEventListener("click", () => switchViewMode("bg1", elements, state));
  elements.viewBg2Button.addEventListener("click", () => switchViewMode("bg2", elements, state));
  elements.viewBg3Button.addEventListener("click", () => switchViewMode("bg3", elements, state));
  elements.viewSpriteButton.addEventListener("click", () => switchViewMode("sprite", elements, state));
  elements.viewSourceButton.addEventListener("click", () => switchViewMode("source", elements, state));

  elements.previewCanvas.addEventListener("pointerdown", (event) => {
    if (!state.sourceImage) {
      return;
    }

    const point = convertPointerToCanvasPoint(event, elements.previewCanvas);
    const nextState = roiManager.beginInteraction(point.x, point.y, state.roi);
    if (!nextState.handled) {
      return;
    }

    state.roi = nextState.nextRoi;
    state.showRoiOverlay = true;
    elements.previewCanvas.setPointerCapture(event.pointerId);
    renderAll(elements, state);
  });

  elements.previewCanvas.addEventListener("pointermove", (event) => {
    if (!state.sourceImage || (event.buttons === 0 && event.pointerType === "mouse")) {
      return;
    }

    const point = convertPointerToCanvasPoint(event, elements.previewCanvas);
    state.roi = roiManager.updateInteraction(
      point.x,
      point.y,
      state.roi,
      elements.previewCanvas.width,
      elements.previewCanvas.height
    );
    state.showRoiOverlay = true;
    renderAll(elements, state);
  });

  const finishPointerInteraction = (event: PointerEvent) => {
      if (!state.sourceImage) {
        return;
      }

      state.roi = roiManager.endInteraction(state.roi);
      state.showRoiOverlay = false;
      elements.previewCanvas.releasePointerCapture(event.pointerId);
      renderAll(elements, state);
  };

  elements.previewCanvas.addEventListener("pointerup", finishPointerInteraction);
  elements.previewCanvas.addEventListener("pointercancel", finishPointerInteraction);
}

/** 画像を読み込み、アプリ状態へ反映するにゃ。 */
async function updateSourceImage(
  file: File,
  state: AppState,
  elements: ReturnType<typeof queryElements>
): Promise<void> {
  const image = await loadImageFromFile(file);
  state.sourceImage = image;
  state.roi = null;

  state.sourceCanvas.width = FAMICOM_SCREEN_WIDTH;
  state.sourceCanvas.height = FAMICOM_SCREEN_HEIGHT;
  const context = state.sourceCanvas.getContext("2d");
  if (!context) {
    throw new Error("画像読み込み用Canvasの初期化に失敗したにゃ。");
  }

  context.clearRect(0, 0, state.sourceCanvas.width, state.sourceCanvas.height);
  context.imageSmoothingEnabled = true;
  context.drawImage(image, 0, 0, state.sourceCanvas.width, state.sourceCanvas.height);

  state.famicomAnalysis = null;
  renderAll(elements, state);
}

/** 現在状態からファミコン減色を再生成するにゃ。 */
function rerenderReduction(state: AppState): void {
  if (!state.sourceImage) {
    return;
  }

  const result = reduceFamicomImage(state.sourceCanvas, state.roi, state.roiEnabled, {
    brightness: state.brightness,
    contrast: state.contrast,
    saturation: state.saturation,
    quantizationMode: state.quantizationMode,
    glitchPreviewEnabled: state.glitchPreviewEnabled
  });
  state.reducedCanvas = result.finalCanvas;
  state.bgCanvas = result.bgCanvas;
  state.spriteCanvas = result.spriteCanvas;
  state.famicomAnalysis = result.analysis;
}

/** 画面全体を再描画するにゃ。 */
function renderAll(elements: ReturnType<typeof queryElements>, state: AppState): void {
  const profile = getMachineProfile();
  elements.machineNote.textContent = profile.notes;
  elements.detailWeightInput.value = String(state.detailWeight);
  elements.brightnessInput.value = String(state.brightness);
  elements.contrastInput.value = String(state.contrast);
  elements.saturationInput.value = String(state.saturation);
  elements.quantizationModeInput.value = state.quantizationMode;
  elements.roiEnabledInput.checked = state.roiEnabled;
  elements.glitchPreviewEnabledInput.checked = state.glitchPreviewEnabled;
  elements.viewFinalButton.classList.toggle("is-active", state.viewMode === "final");
  elements.viewBg0Button.classList.toggle("is-active", state.viewMode === "bg0");
  elements.viewBg1Button.classList.toggle("is-active", state.viewMode === "bg1");
  elements.viewBg2Button.classList.toggle("is-active", state.viewMode === "bg2");
  elements.viewBg3Button.classList.toggle("is-active", state.viewMode === "bg3");
  elements.viewSpriteButton.classList.toggle("is-active", state.viewMode === "sprite");
  elements.viewSourceButton.classList.toggle("is-active", state.viewMode === "source");

  renderCanvas(elements.previewCanvas, elements.emptyState, state);
  renderRoiStats(elements.roiStats, state.roi, state.roiEnabled, state.famicomAnalysis);
  renderBgPaletteInfo(elements.bgPaletteInfo, state.famicomAnalysis);
  renderSpriteInfo(elements.spriteInfo, state.famicomAnalysis);
  renderWarningInfo(elements.warningInfo, state.famicomAnalysis);
  renderTilePaletteInfo(elements.bgTilePaletteInfo, state.famicomAnalysis, "bg");
  renderTilePaletteInfo(elements.spriteTilePaletteInfo, state.famicomAnalysis, "sprite");
}

/** キャンバスを再描画するにゃ。 */
function renderCanvas(
  previewCanvas: HTMLCanvasElement,
  emptyStateElement: HTMLDivElement,
  state: AppState
): void {
  if (!state.sourceImage) {
    emptyStateElement.style.display = "grid";
    previewCanvas.width = 640;
    previewCanvas.height = 360;
    const context = previewCanvas.getContext("2d");
    if (context) {
      context.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    }
    return;
  }

  emptyStateElement.style.display = "none";

  const displayCanvas = getDisplayCanvas(state);
  if (displayCanvas.width === 0 || displayCanvas.height === 0) {
    emptyStateElement.style.display = "grid";
    emptyStateElement.textContent = "設定を調整して「生成」を押してにゃ";
    previewCanvas.width = state.sourceCanvas.width || 640;
    previewCanvas.height = state.sourceCanvas.height || 360;
    const context = previewCanvas.getContext("2d");
    if (context) {
      context.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    }
    return;
  }
  previewCanvas.width = displayCanvas.width;
  previewCanvas.height = displayCanvas.height;

  const context = previewCanvas.getContext("2d");
  if (!context) {
    throw new Error("プレビューCanvasの描画に失敗したにゃ。");
  }

  context.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  context.drawImage(displayCanvas, 0, 0);

  if ((state.viewMode === "bg" || isBgPaletteViewMode(state.viewMode)) && state.famicomAnalysis) {
    drawBgAttributeOverlay(context, state.famicomAnalysis, getHighlightedBgPaletteIndex(state.viewMode));
  }

  if (shouldShowRoiOverlay(state)) {
    drawRoiOverlay(context, state.roi);
  }
}

/** 現在モードに応じた表示Canvasを返すにゃ。 */
function getDisplayCanvas(state: AppState): HTMLCanvasElement {
  switch (state.viewMode) {
    case "bg":
      return state.bgCanvas;
    case "bg0":
    case "bg1":
    case "bg2":
    case "bg3":
      return createBgPaletteFocusCanvas(state.bgCanvas, state.famicomAnalysis, getHighlightedBgPaletteIndex(state.viewMode));
    case "sprite":
      return state.spriteCanvas;
    case "source":
      return state.sourceCanvas;
    case "final":
    default:
      return state.reducedCanvas;
  }
}


/** ROI統計を描画するにゃ。 */
function renderRoiStats(
  container: HTMLDivElement,
  roi: RegionOfInterest | null,
  roiEnabled: boolean,
  analysis: AppState["famicomAnalysis"]
): void {
  if (!roi) {
    container.innerHTML = "<p class=\"info-line\">ROIは未設定にゃ。</p>";
    return;
  }

  const area = Math.round(roi.width * roi.height);
  const overlapCells = analysis?.attributeCells.filter((cell) => cell.overlapsRoi).length ?? 0;
  container.innerHTML = `
    <p class="info-line">状態: ${roiEnabled && roi.enabled ? "有効" : "無効"}</p>
    <p class="info-line">位置: (${Math.round(roi.x)}, ${Math.round(roi.y)})</p>
    <p class="info-line">サイズ: ${Math.round(roi.width)} x ${Math.round(roi.height)}</p>
    <p class="info-line">重み: ${roi.detailWeight.toFixed(1)}</p>
    <p class="info-line">面積: ${area}px</p>
    <p class="info-line">重なった属性セル数: ${overlapCells}</p>
  `;
}

/** BGパレット情報を描画するにゃ。 */
function renderBgPaletteInfo(container: HTMLDivElement, analysis: AppState["famicomAnalysis"]): void {
  if (!analysis) {
    container.innerHTML = "<p class=\"info-line\">画像を読み込むとBGパレットを表示するにゃ。</p>";
    return;
  }

  const universalColor = formatFamicomColor(analysis.universalColor);
  const paletteSummaries = analysis.bgSubPalettes.map((subPalette, index) => {
    const assignedCells = analysis.attributeCells.filter((cell) => cell.paletteIndex === index);
    const attributeCellCount = assignedCells.length;
    const tileCount = attributeCellCount * 4;
    const spriteFallbackPixels = assignedCells.reduce((total, cell) => total + cell.renderedBySpritePixelCount, 0);
    return {
      index,
      subPalette,
      attributeCellCount,
      tileCount,
      spriteFallbackPixels
    };
  });
  const paletteLines = analysis.bgSubPalettes
    .map((subPalette, index) => {
      const chips = renderPaletteChipGroup(subPalette);
      const summary = paletteSummaries[index];
      return `
        <div class="palette-block">
          <p class="info-line">BG${index}: ${chips}</p>
          <p class="info-line">割り当て属性セル: ${summary.attributeCellCount} / 推定8x8タイル: ${summary.tileCount} / Sprite補完画素: ${summary.spriteFallbackPixels}</p>
        </div>
      `;
    })
    .join("");
  const spritePaletteLines = analysis.spriteSubPalettes
    .map((subPalette, index) => {
      const chips = renderPaletteChipGroup(subPalette);
      return `<div class="palette-block"><p class="info-line">SP${index}: ${chips}</p></div>`;
    })
    .join("");
  const bgUsageBlocks = analysis.bgPaletteUsage
    .map((entries, index) => renderPaletteUsageBlock(`BG${index}`, entries))
    .join("");
  const spriteUsageBlocks = analysis.spritePaletteUsage
    .map((entries, index) => renderPaletteUsageBlock(`SP${index}`, entries))
    .join("");

  const hotspotCells = [...analysis.attributeCells]
    .sort((left, right) => {
      if (left.overlapsRoi !== right.overlapsRoi) {
        return left.overlapsRoi ? -1 : 1;
      }
      if (left.missingPixelCount !== right.missingPixelCount) {
        return right.missingPixelCount - left.missingPixelCount;
      }
      return right.weightedScore - left.weightedScore;
    })
    .slice(0, 6)
    .map((cell) => {
      const desiredColors = cell.topColors.length > 0
        ? cell.topColors.map((color) => formatFamicomColor(color)).join(", ")
        : "なし";
      const supportedColors = cell.supportedColors.map((color) => formatFamicomColor(color)).join(", ");
      const roiLabel = cell.overlapsRoi ? " ROI" : "";
      return `
        <li>
          cell(${cell.cellX}, ${cell.cellY}) / BG${cell.paletteIndex}${roiLabel}
          / 欲しい色: ${desiredColors}
          / 使用色: ${supportedColors}
          / BG不足: ${cell.missingPixelCount}px
        </li>
      `;
    })
    .join("");

  container.innerHTML = `
    <p class="info-line">Universal background color: ${universalColor}</p>
    <p class="info-line">BGユニーク8x8タイル数: ${analysis.uniqueBgTileCount} / ${analysis.totalBgTileCount}</p>
    <p class="info-line">Spriteユニーク8x8タイル数: ${analysis.uniqueSpriteTileCount} / ${analysis.totalSpriteTileCount}</p>
    <p class="info-line">BG 8x8色数内訳: 1色 ${analysis.bgTileColorStats.oneColorTileCount} / 2色 ${analysis.bgTileColorStats.twoColorTileCount} / 3色 ${analysis.bgTileColorStats.threeColorTileCount} / 4色 ${analysis.bgTileColorStats.fourColorTileCount}</p>
    <p class="info-line">Universal color を使っているBG 8x8タイル数: ${analysis.bgTileColorStats.universalColorUsedTileCount} / ${analysis.totalBgTileCount}</p>
    <p class="info-line">ファミコンは BG0-BG3 ごとの枚数上限はなく、属性セル割り当てと総タイル数を見るのが大事にゃ。</p>
    ${paletteLines}
    <p class="info-line">BGパレット利用ドット数</p>
    <div class="palette-usage-grid">${bgUsageBlocks}</div>
    <p class="info-line">Spriteパレット</p>
    ${spritePaletteLines}
    <p class="info-line">Spriteパレット利用ドット数</p>
    <div class="palette-usage-grid">${spriteUsageBlocks}</div>
    <p class="info-line">BGタブの見方: 白グリッドは16x16属性セル、ラベルは割り当てBGパレット、赤みセルはSprite補完ありにゃ。</p>
    <p class="info-line">BG0-BG3タブでは、そのパレット担当セルだけ明るく確認できるにゃ。</p>
    <p class="info-line">重点属性セル</p>
    <ul class="info-list">${hotspotCells || "<li>表示できる属性セルはまだないにゃ。</li>"}</ul>
  `;
}

/** スプライト候補情報を描画するにゃ。 */
function renderSpriteInfo(container: HTMLDivElement, analysis: AppState["famicomAnalysis"]): void {
  if (!analysis) {
    container.innerHTML = "<p class=\"info-line\">画像を読み込むとスプライト候補を表示するにゃ。</p>";
    return;
  }

  const topCandidates = analysis.spriteCandidates
    .slice(0, 8)
    .map((candidate) => {
      const roiLabel = candidate.overlapsRoi ? " ROI内" : "";
      const selectionLabel = candidate.accepted
        ? `採用 ${candidate.spriteCount} / ${candidate.tileCount} 枚`
        : `不採用 ${candidate.rejectedTileCount} 枚`;
      const paletteLabel = candidate.spritePaletteIndex === null
        ? "SP未割当"
        : `SP${candidate.spritePaletteIndex}`;
      const colorLabel = candidate.spriteColors.length > 0
        ? candidate.spriteColors.map((color) => formatFamicomColor(color)).join(", ")
        : "なし";
      return `
        <li>
          tile(${candidate.tileX}, ${candidate.tileY})
          / ${candidate.widthTiles}x${candidate.heightTiles} タイル
          / ${selectionLabel}
          / ${paletteLabel}
          / 候補色: ${colorLabel}
          / ${candidate.pixelCount}px${roiLabel}
        </li>
      `;
    })
    .join("");

  container.innerHTML = `
    <p class="info-line">候補スプライト塊数: ${analysis.spriteCandidates.length}</p>
    <p class="info-line">ROI優先候補数: ${analysis.spriteCandidates.filter((candidate) => candidate.overlapsRoi).length}</p>
    <p class="info-line">採用された8x8スプライト数: ${analysis.spriteCandidates.reduce((total, candidate) => total + candidate.spriteCount, 0)}</p>
    <p class="info-line">落選した8x8スプライト数: ${analysis.rejectedSpriteTiles.length}</p>
    <p class="info-line">Sprite表示の見方: 採用されたスプライト画素だけを表示し、スプライトがない場所は黒で埋めるにゃ。</p>
    <p class="info-line">SP0-SP3 は採用候補の色分布から自動生成した暫定パレットにゃ。</p>
    <ul class="info-list">${topCandidates || "<li>候補なしにゃ。</li>"}</ul>
  `;
}

/** パレット利用ドット数ブロックを描画するにゃ。 */
function renderPaletteUsageBlock(label: string, entries: Array<{ colorIndex: number; pixelCount: number }>): string {
  const cells = entries
    .map((entry) => {
      const rgb = getFamicomColorRgb(entry.colorIndex);
      const hex = formatFamicomRgbHex(entry.colorIndex);
      const colorCode = `$${entry.colorIndex.toString(16).toUpperCase().padStart(2, "0")}`;
      const textColor = getReadableTextColor(rgb[0], rgb[1], rgb[2]);
      const rgbLabel = `${rgb[0]} ${rgb[1]} ${rgb[2]}`;
      return `
        <div class="palette-usage-cell" style="background:rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]});color:${textColor};">
          <p class="palette-usage-code">${colorCode}</p>
          <p class="palette-usage-hex">${hex}</p>
          <p class="palette-usage-rgb">${rgbLabel}</p>
          <p class="palette-usage-count">${entry.pixelCount} px</p>
        </div>
      `;
    })
    .join("");

  return `
    <div class="palette-usage-block">
      <p class="palette-usage-label">${label}</p>
      <div class="palette-usage-cells">
        ${cells}
      </div>
    </div>
  `;
}

/** 指定色の上で見やすい文字色を返すにゃ。 */
function getReadableTextColor(red: number, green: number, blue: number): string {
  const luma = red * 0.299 + green * 0.587 + blue * 0.114;
  return luma >= 150 ? "#111111" : "#f8f4ea";
}

/** ファミコン色番号に対応するRGBを返すにゃ。 */
function getFamicomColorRgb(colorIndex: number): readonly [number, number, number] {
  return FAMICOM_DISPLAY_PALETTE[colorIndex] ?? [0, 0, 0];
}

/** ファミコン色番号をRGB16進表記へ整形するにゃ。 */
function formatFamicomRgbHex(colorIndex: number): string {
  const rgb = getFamicomColorRgb(colorIndex);
  return `#${rgb.map((value) => value.toString(16).toUpperCase().padStart(2, "0")).join("")}`;
}

/** 警告情報を描画するにゃ。 */
function renderWarningInfo(container: HTMLDivElement, analysis: AppState["famicomAnalysis"]): void {
  if (!analysis) {
    container.innerHTML = "<p class=\"info-line\">画像を読み込むと警告を表示するにゃ。</p>";
    return;
  }

  const overflowCells = analysis.attributeCells.filter((cell) => cell.unresolvedPixelCount > 0).length;
  const lines: Array<{ text: string; isProblem: boolean }> = [
    {
      text: `総合判定: ${analysis.hardwareStatus === "ok" ? "概算では実機制限内にゃ" : "要注意にゃ"}`,
      isProblem: analysis.hardwareStatus !== "ok"
    },
    {
      text: `未解決の属性セル不足: ${overflowCells} セル`,
      isProblem: overflowCells > 0
    },
    {
      text: `未解決画素総数: ${analysis.attributeCells.reduce((total, cell) => total + cell.unresolvedPixelCount, 0)} px`,
      isProblem: overflowCells > 0
    },
    {
      text: `BGユニーク8x8タイル数: ${analysis.uniqueBgTileCount} / ${analysis.totalBgTileCount}`,
      isProblem: analysis.uniqueBgTileCount > 256
    },
    {
      text: `Spriteユニーク8x8タイル数: ${analysis.uniqueSpriteTileCount} / ${analysis.totalSpriteTileCount}`,
      isProblem: analysis.uniqueSpriteTileCount > 256
    },
    {
      text: `スプライト走査線超過: ${analysis.scanlineOverflowCount} 行`,
      isProblem: analysis.scanlineOverflowCount > 0
    },
    {
      text: `スプライト候補総数: ${analysis.spriteCandidates.length} 塊`,
      isProblem: false
    },
    {
      text: `採用8x8スプライト総数: ${analysis.spriteCandidates.reduce((total, candidate) => total + candidate.spriteCount, 0)} 枚`,
      isProblem: false
    },
    {
      text: `落選8x8スプライト総数: ${analysis.spriteCandidates.reduce((total, candidate) => total + candidate.rejectedTileCount, 0)} 枚`,
      isProblem: analysis.spriteCandidates.some((candidate) => candidate.rejectedTileCount > 0)
    },
    {
      text: `収束反復回数: ${analysis.convergenceIterations} 回`,
      isProblem: false
    },
    {
      text: "実用版メモ: 落選Sprite分は最終画像でBG近似のまま残るにゃ",
      isProblem: false
    }
  ];

  const findings = analysis.hardwareFindings.map((line) => `<li>${line}</li>`).join("");
  const convergenceHistory = analysis.convergenceHistory
    .map((step) => `
      <li>
        ${step.iteration}回目:
        BG ${step.bgUniqueTileCount}
        / SP ${step.spriteUniqueTileCount}
        / 未解決セル ${step.unresolvedAttributeCellCount}
        / 未解決px ${step.unresolvedPixelCount}
        / 落選SP ${step.rejectedSpriteCount}
        / 走査線超過 ${step.scanlineOverflowCount}
      </li>
    `)
    .join("");
  container.innerHTML = `
    <ul class="info-list">${
      lines
        .map((line) => `<li${line.isProblem ? " style=\"color:#c53b2c;font-weight:700;\"" : ""}>${line.text}</li>`)
        .join("")
    }</ul>
    <p class="info-line">簡易ハードウェア判定</p>
    <ul class="info-list">${findings}</ul>
    <p class="info-line">収束履歴</p>
    <ul class="info-list">${convergenceHistory || "<li>履歴なしにゃ。</li>"}</ul>
  `;
}

/** BG/Spriteの番地順タイル一覧を描画するにゃ。 */
function renderTilePaletteInfo(
  container: HTMLDivElement,
  analysis: AppState["famicomAnalysis"],
  kind: "bg" | "sprite"
): void {
  if (!analysis) {
    container.innerHTML = `<p class="info-line">画像を読み込むと${kind === "bg" ? "BG" : "Sprite"}タイルパレットを表示するにゃ。</p>`;
    return;
  }

  const tilePaletteSheet = kind === "bg"
    ? analysis.bgTilePaletteSheet
    : analysis.spriteTilePaletteSheet;
  const usageSummary = tilePaletteSheet.entries
    .slice(0, 16)
    .map((entry) => `$${entry.address.toString(16).toUpperCase().padStart(2, "0")}: ${entry.usageCount}`)
    .join(" / ");

  container.innerHTML = "";
  const summary = document.createElement("p");
  summary.className = "info-line";
  summary.textContent =
    `${kind === "bg" ? "BG" : "Sprite"}番地数: ${tilePaletteSheet.entries.length} / ` +
    `${kind === "bg" ? analysis.totalBgTileCount : analysis.totalSpriteTileCount} 使用タイル`;
  container.appendChild(summary);

  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent = usageSummary.length > 0
    ? `先頭の使用回数: ${usageSummary}`
    : "使用タイルはまだないにゃ。";
  container.appendChild(hint);

  if (tilePaletteSheet.entries.length === 0) {
    return;
  }

  const canvas = document.createElement("canvas");
  canvas.width = tilePaletteSheet.canvas.width;
  canvas.height = tilePaletteSheet.canvas.height;
  canvas.className = "tile-palette-canvas";
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("タイルパレットCanvasの描画に失敗したにゃ。");
  }
  context.drawImage(tilePaletteSheet.canvas, 0, 0);
  container.appendChild(canvas);
}

/** ROIオーバーレイを描くにゃ。 */
function drawRoiOverlay(context: CanvasRenderingContext2D, roi: RegionOfInterest): void {
  context.save();
  context.strokeStyle = "#ff7a00";
  context.lineWidth = Math.max(1, Math.round(Math.min(context.canvas.width, context.canvas.height) / 240));
  context.setLineDash([6, 4]);
  context.strokeRect(roi.x, roi.y, roi.width, roi.height);

  context.setLineDash([]);
  const handles = [
    [roi.x, roi.y],
    [roi.x + roi.width, roi.y],
    [roi.x, roi.y + roi.height],
    [roi.x + roi.width, roi.y + roi.height]
  ];

  for (const [handleX, handleY] of handles) {
    context.fillStyle = "#fff6dd";
    context.strokeStyle = "#7a2f00";
    context.lineWidth = 2;
    context.beginPath();
    context.arc(handleX, handleY, 6, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  }
  context.restore();
}

/** BG属性セルの割り当てオーバーレイを描くにゃ。 */
function drawBgAttributeOverlay(
  context: CanvasRenderingContext2D,
  analysis: NonNullable<AppState["famicomAnalysis"]>,
  highlightedPaletteIndex: number | null
): void {
  if (highlightedPaletteIndex !== null) {
    return;
  }

  const attributeSize = 16;

  context.save();
  context.font = `${Math.max(10, Math.round(Math.min(context.canvas.width, context.canvas.height) / 32))}px monospace`;
  context.textAlign = "left";
  context.textBaseline = "top";

  for (const cell of analysis.attributeCells) {
    const x = cell.cellX * attributeSize;
    const y = cell.cellY * attributeSize;
    const isHighlighted = highlightedPaletteIndex === null || cell.paletteIndex === highlightedPaletteIndex;

    context.strokeStyle = isHighlighted ? "rgba(255, 255, 255, 0.55)" : "rgba(255, 255, 255, 0.18)";
    context.lineWidth = 1;
    context.strokeRect(x + 0.5, y + 0.5, attributeSize - 1, attributeSize - 1);

    if (cell.renderedBySpritePixelCount > 0) {
      context.fillStyle = isHighlighted ? "rgba(255, 80, 80, 0.18)" : "rgba(255, 80, 80, 0.08)";
      context.fillRect(x, y, attributeSize, attributeSize);
    }

    context.fillStyle = isHighlighted ? "rgba(16, 24, 32, 0.78)" : "rgba(16, 24, 32, 0.52)";
    context.fillRect(x + 1, y + 1, 15, 9);
    context.fillStyle = isHighlighted ? "#fff6dd" : "rgba(255, 246, 221, 0.62)";
    context.fillText(`BG${cell.paletteIndex}`, x + 2, y + 1);
  }

  context.restore();
}

/** BG0-BG3の注目表示用Canvasを生成するにゃ。 */
function createBgPaletteFocusCanvas(
  bgCanvas: HTMLCanvasElement,
  analysis: AppState["famicomAnalysis"],
  paletteIndex: number | null
): HTMLCanvasElement {
  if (!analysis || paletteIndex === null) {
    return bgCanvas;
  }

  const focusedCanvas = document.createElement("canvas");
  focusedCanvas.width = bgCanvas.width;
  focusedCanvas.height = bgCanvas.height;
  const context = focusedCanvas.getContext("2d");
  if (!context) {
    throw new Error("BG注目表示Canvasの描画に失敗したにゃ。");
  }

  context.drawImage(bgCanvas, 0, 0);
  context.fillStyle = UNUSED_PREVIEW_COLOR;

  for (const cell of analysis.attributeCells) {
    if (cell.paletteIndex === paletteIndex) {
      continue;
    }

    context.fillRect(cell.cellX * 16, cell.cellY * 16, 16, 16);
  }

  return focusedCanvas;
}

/** BG個別表示モードかどうかを返すにゃ。 */
function isBgPaletteViewMode(viewMode: AppState["viewMode"]): boolean {
  return viewMode === "bg0" || viewMode === "bg1" || viewMode === "bg2" || viewMode === "bg3";
}

/** BG個別表示モードからパレット番号を返すにゃ。 */
function getHighlightedBgPaletteIndex(viewMode: AppState["viewMode"]): number | null {
  switch (viewMode) {
    case "bg0":
      return 0;
    case "bg1":
      return 1;
    case "bg2":
      return 2;
    case "bg3":
      return 3;
    default:
      return null;
  }
}

/** 現在の状態でROIオーバーレイを描くべきか返すにゃ。 */
function shouldShowRoiOverlay(state: AppState): state is AppState & { roi: RegionOfInterest } {
  if (!state.roi || !state.roiEnabled || !state.roi.enabled) {
    return false;
  }
  return true;
}

/** タブ表示を切り替えるにゃ。 */
function switchViewMode(
  viewMode: AppState["viewMode"],
  elements: ReturnType<typeof queryElements>,
  state: AppState
): void {
  state.viewMode = viewMode;
  renderAll(elements, state);
}

/** ファミコン色番号を見やすく整形するにゃ。 */
function formatFamicomColor(colorIndex: number): string {
  return `$${colorIndex.toString(16).toUpperCase().padStart(2, "0")}`;
}

/** サブパレット表示を返すにゃ。 */
function renderPaletteChipGroup(subPalette: FamicomSubPalette): string {
  return subPalette.map((color) => formatFamicomColor(color)).join(", ");
}

/** PointerEventをキャンバス内の論理座標へ変換するにゃ。 */
function convertPointerToCanvasPoint(event: PointerEvent, canvas: HTMLCanvasElement): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY
  };
}

/** 必須要素を取得するにゃ。 */
function requireElement<T extends Element>(rootElement: HTMLElement, selector: string): T {
  const element = rootElement.querySelector<T>(selector);
  if (!element) {
    throw new Error(`必要な要素が見つからないにゃ: ${selector}`);
  }
  return element;
}

/** Canvasの内容をPNGとして保存するにゃ。 */
function saveCanvasImage(canvas: HTMLCanvasElement, fileName: string): void {
  if (canvas.width === 0 || canvas.height === 0) {
    return;
  }

  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = fileName;
  link.click();
}
