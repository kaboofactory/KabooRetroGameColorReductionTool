import type { MachineProfile } from "./types";

const FAMICOM_PROFILE: MachineProfile = {
  id: "famicom",
  label: "ファミリーコンピュータ",
  notes: "※ファミコンハードウェアをある程度シミュレートしているけど完全ではないので要注意"
};

/** ファミコンの固定プロファイルを返すにゃ。 */
export function getMachineProfile(): MachineProfile {
  return FAMICOM_PROFILE;
}
