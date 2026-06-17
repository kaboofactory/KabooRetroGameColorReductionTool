import type { InputState, RegionOfInterest, RoiHandle } from "./types";

const HANDLE_RADIUS = 8;
const ROI_TILE_SIZE = 8;

/** 単一ROIの入力操作を扱うクラスにゃ。 */
export class RoiManager {
  private readonly inputState: InputState = {
    mode: "idle",
    activePointerId: null,
    activeHandle: null,
    startImageX: 0,
    startImageY: 0,
    originRoi: null
  };

  /** ポインターダウン時の次状態を計算するにゃ。 */
  public beginInteraction(
    imageX: number,
    imageY: number,
    currentRoi: RegionOfInterest | null
  ): { nextRoi: RegionOfInterest | null; handled: boolean } {
    const hitHandle = currentRoi ? this.findHandleHit(imageX, imageY, currentRoi) : null;
    const isInside = currentRoi ? this.isPointInsideRoi(imageX, imageY, currentRoi) : false;

    this.inputState.activePointerId = 1;
    this.inputState.startImageX = imageX;
    this.inputState.startImageY = imageY;
    this.inputState.originRoi = currentRoi ? { ...currentRoi } : null;

    if (hitHandle && currentRoi) {
      this.inputState.mode = "resizing-roi";
      this.inputState.activeHandle = hitHandle;
      return { nextRoi: currentRoi, handled: true };
    }

    if (isInside && currentRoi) {
      this.inputState.mode = "moving-roi";
      this.inputState.activeHandle = null;
      return { nextRoi: currentRoi, handled: true };
    }

    this.inputState.mode = "creating-roi";
    this.inputState.activeHandle = null;
    return {
      nextRoi: createNormalizedRoi(
        this.inputState.startImageX,
        this.inputState.startImageY,
        imageX,
        imageY,
        currentRoi?.detailWeight ?? 2
      ),
      handled: true
    };
  }

  /** ポインタームーブ時のROI更新を行うにゃ。 */
  public updateInteraction(
    imageX: number,
    imageY: number,
    currentRoi: RegionOfInterest | null,
    boundsWidth: number,
    boundsHeight: number
  ): RegionOfInterest | null {
    switch (this.inputState.mode) {
      case "creating-roi":
        return clampRoiToBounds(
          snapRoiToTile(
            createNormalizedRoi(
              this.inputState.startImageX,
              this.inputState.startImageY,
              imageX,
              imageY,
              currentRoi?.detailWeight ?? 2
            )
          ),
          boundsWidth,
          boundsHeight
        );
      case "moving-roi":
        return this.moveRoi(imageX, imageY, currentRoi, boundsWidth, boundsHeight);
      case "resizing-roi":
        return this.resizeRoi(imageX, imageY, currentRoi, boundsWidth, boundsHeight);
      default:
        return currentRoi;
    }
  }

  /** 入力状態を終了するにゃ。 */
  public endInteraction(currentRoi: RegionOfInterest | null): RegionOfInterest | null {
    this.inputState.mode = "idle";
    this.inputState.activePointerId = null;
    this.inputState.activeHandle = null;
    this.inputState.originRoi = null;

    if (!currentRoi) {
      return null;
    }

    if (currentRoi.width < 4 || currentRoi.height < 4) {
      return null;
    }

    return currentRoi;
  }

  /** 指定点がどのハンドルに当たっているかを返すにゃ。 */
  public findHandleHit(imageX: number, imageY: number, roi: RegionOfInterest): RoiHandle | null {
    const points: Array<[RoiHandle, number, number]> = [
      ["nw", roi.x, roi.y],
      ["ne", roi.x + roi.width, roi.y],
      ["sw", roi.x, roi.y + roi.height],
      ["se", roi.x + roi.width, roi.y + roi.height],
      ["n", roi.x + roi.width / 2, roi.y],
      ["e", roi.x + roi.width, roi.y + roi.height / 2],
      ["s", roi.x + roi.width / 2, roi.y + roi.height],
      ["w", roi.x, roi.y + roi.height / 2]
    ];

    for (const [handle, handleX, handleY] of points) {
      const distance = Math.hypot(imageX - handleX, imageY - handleY);
      if (distance <= HANDLE_RADIUS) {
        return handle;
      }
    }

    return null;
  }

  /** 指定点がROI内にあるか返すにゃ。 */
  public isPointInsideRoi(imageX: number, imageY: number, roi: RegionOfInterest): boolean {
    return imageX >= roi.x && imageX <= roi.x + roi.width && imageY >= roi.y && imageY <= roi.y + roi.height;
  }

  /** ROIを移動するにゃ。 */
  private moveRoi(
    imageX: number,
    imageY: number,
    currentRoi: RegionOfInterest | null,
    boundsWidth: number,
    boundsHeight: number
  ): RegionOfInterest | null {
    if (!currentRoi || !this.inputState.originRoi) {
      return currentRoi;
    }

    const deltaX = imageX - this.inputState.startImageX;
    const deltaY = imageY - this.inputState.startImageY;
    const nextRoi = {
      ...currentRoi,
      x: this.inputState.originRoi.x + deltaX,
      y: this.inputState.originRoi.y + deltaY
    };

    return clampRoiToBounds(snapRoiToTile(nextRoi), boundsWidth, boundsHeight);
  }

  /** ROIをリサイズするにゃ。 */
  private resizeRoi(
    imageX: number,
    imageY: number,
    currentRoi: RegionOfInterest | null,
    boundsWidth: number,
    boundsHeight: number
  ): RegionOfInterest | null {
    if (!currentRoi || !this.inputState.originRoi || !this.inputState.activeHandle) {
      return currentRoi;
    }

    const origin = this.inputState.originRoi;
    let left = origin.x;
    let top = origin.y;
    let right = origin.x + origin.width;
    let bottom = origin.y + origin.height;

    if (this.inputState.activeHandle.includes("w")) {
      left = imageX;
    }
    if (this.inputState.activeHandle.includes("e")) {
      right = imageX;
    }
    if (this.inputState.activeHandle.includes("n")) {
      top = imageY;
    }
    if (this.inputState.activeHandle.includes("s")) {
      bottom = imageY;
    }

    const nextRoi = createNormalizedRoi(left, top, right, bottom, origin.detailWeight);
    nextRoi.enabled = origin.enabled;
    return clampRoiToBounds(snapRoiToTile(nextRoi), boundsWidth, boundsHeight);
  }
}

/** 任意2点から正規化済みROIを生成するにゃ。 */
function createNormalizedRoi(startX: number, startY: number, endX: number, endY: number, detailWeight: number): RegionOfInterest {
  const x = Math.min(startX, endX);
  const y = Math.min(startY, endY);
  const width = Math.abs(endX - startX);
  const height = Math.abs(endY - startY);

  return {
    x,
    y,
    width,
    height,
    detailWeight,
    enabled: true
  };
}

/** ROIを画像境界へ収めるにゃ。 */
function clampRoiToBounds(roi: RegionOfInterest, boundsWidth: number, boundsHeight: number): RegionOfInterest {
  const width = Math.min(roi.width, boundsWidth);
  const height = Math.min(roi.height, boundsHeight);
  const x = Math.min(Math.max(0, roi.x), Math.max(0, boundsWidth - width));
  const y = Math.min(Math.max(0, roi.y), Math.max(0, boundsHeight - height));

  return {
    ...roi,
    x,
    y,
    width,
    height
  };
}

/** ROIを8x8タイル単位へ丸めるにゃ。 */
function snapRoiToTile(roi: RegionOfInterest): RegionOfInterest {
  const left = snapToTile(roi.x);
  const top = snapToTile(roi.y);
  const right = snapToTile(roi.x + roi.width);
  const bottom = snapToTile(roi.y + roi.height);

  return {
    ...roi,
    x: left,
    y: top,
    width: Math.max(ROI_TILE_SIZE, right - left),
    height: Math.max(ROI_TILE_SIZE, bottom - top)
  };
}

/** 値を最寄りの8px境界へ四捨五入するにゃ。 */
function snapToTile(value: number): number {
  return Math.round(value / ROI_TILE_SIZE) * ROI_TILE_SIZE;
}
