import { bootstrapApp } from "./app";

const rootElement = document.querySelector<HTMLElement>("#app");

if (!rootElement) {
  throw new Error("アプリのマウント先が見つからないにゃ。");
}

bootstrapApp(rootElement);
