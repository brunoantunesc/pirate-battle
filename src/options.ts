import {
  DEFAULT_CONFIG,
  validateOptions,
  type GameConfig,
} from "./game/config";
export const OPTIONS_KEY = "pirate.options.v1";
export function loadConfig(): GameConfig {
  try {
    const saved: unknown = JSON.parse(
      localStorage.getItem(OPTIONS_KEY) ?? "null",
    );
    if (
      typeof saved === "object" &&
      saved !== null &&
      "duration" in saved &&
      "spawnInterval" in saved &&
      typeof saved.duration === "number" &&
      typeof saved.spawnInterval === "number" &&
      validOptions(saved.duration, saved.spawnInterval)
    ) {
      return {
        ...structuredClone(DEFAULT_CONFIG),
        duration: saved.duration,
        spawnInterval: saved.spawnInterval,
      };
    }
  } catch {
    /* Invalid saved settings fall back to safe defaults. */
  }
  return structuredClone(DEFAULT_CONFIG);
}
export function validOptions(duration: number, spawn: number) {
  return validateOptions(duration, spawn) === null;
}
