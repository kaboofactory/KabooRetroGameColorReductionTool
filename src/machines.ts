import type { MachineProfile } from "./types";

const FAMICOM_PROFILE: MachineProfile = {
  id: "famicom",
  label: "ファミリーコンピュータ",
  notes: "画像をファミコン風に変換するにゃ。"
};

/** ファミコンの固定プロファイルを返すにゃ。 */
export function getMachineProfile(): MachineProfile {
  return FAMICOM_PROFILE;
}
