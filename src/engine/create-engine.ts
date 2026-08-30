import type { DopEngine, DopEngineOptions } from "../api/types.js";

export function createDopEngine<T>(
  options: DopEngineOptions<T>,
): DopEngine<T> {
  void options;
  throw new Error("createDopEngine is not implemented in M0.");
}
