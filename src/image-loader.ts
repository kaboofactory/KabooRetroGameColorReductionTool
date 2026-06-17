/** 画像ファイルからHTMLImageElementを生成するにゃ。 */
export async function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  const dataUrl = await readFileAsDataUrl(file);
  return loadImageFromUrl(dataUrl);
}

/** クリップボードイベントから画像ファイルを探すにゃ。 */
export function getImageFileFromPasteEvent(event: ClipboardEvent): File | null {
  const items = event.clipboardData?.items;
  if (!items) {
    return null;
  }

  for (const item of items) {
    if (item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) {
        return file;
      }
    }
  }

  return null;
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
