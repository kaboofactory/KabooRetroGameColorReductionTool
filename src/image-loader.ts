/** 画像ファイルからHTMLImageElementを生成するにゃ。 */
export async function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  const dataUrl = await readFileAsDataUrl(file);
  return loadImageFromUrl(dataUrl);
}

/** クリップボードイベントから画像ファイルを探すにゃ。 */
export function getImageFileFromPasteEvent(event: ClipboardEvent): File | null {
  const directFile = getImageFileFromDataTransfer(event.clipboardData ?? null);
  if (directFile) {
    return directFile;
  }

  const items = event.clipboardData?.items;
  if (!items) {
    return null;
  }

  for (const item of items) {
    if (item.kind !== "file") {
      continue;
    }

    if (item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) {
        return file;
      }
    }
  }

  return null;
}

/** Clipboard API から画像ファイルを探すにゃ。 */
export async function readImageFileFromClipboardApi(): Promise<File | null> {
  if (!("clipboard" in navigator) || typeof navigator.clipboard.read !== "function") {
    return null;
  }

  try {
    const clipboardItems = await navigator.clipboard.read();
    for (const clipboardItem of clipboardItems) {
      const imageType = clipboardItem.types.find((type) => type.startsWith("image/"));
      if (!imageType) {
        continue;
      }

      const blob = await clipboardItem.getType(imageType);
      return new File([blob], `clipboard-image.${getFileExtensionFromMimeType(imageType)}`, {
        type: imageType
      });
    }
  } catch {
    return null;
  }

  return null;
}

/** DataTransfer から画像ファイルを探すにゃ。 */
function getImageFileFromDataTransfer(dataTransfer: DataTransfer | null): File | null {
  const files = dataTransfer?.files;
  if (!files || files.length === 0) {
    return null;
  }

  for (const file of files) {
    if (file.type.startsWith("image/")) {
      return file;
    }
  }

  return null;
}

/** MIME type から無難な拡張子を返すにゃ。 */
function getFileExtensionFromMimeType(mimeType: string): string {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/bmp":
      return "bmp";
    case "image/svg+xml":
      return "svg";
    case "image/png":
    default:
      return "png";
  }
}

/** FileをData URLへ変換するにゃ。 */
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("画像の読み込み結果が不正にゃ。"));
        return;
      }
      resolve(result);
    };

    reader.onerror = () => {
      reject(new Error("画像ファイルの読み込みに失敗したにゃ。"));
    };

    reader.readAsDataURL(file);
  });
}

/** URLからHTMLImageElementを生成するにゃ。 */
function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("画像のデコードに失敗したにゃ。"));
    image.src = url;
  });
}
