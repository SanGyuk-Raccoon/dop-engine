import type { DopData } from "../api/types.js";

export type Path = readonly string[];

export type Change =
  | {
      readonly op: "add";
      readonly path: Path;
      readonly after: DopData;
    }
  | {
      readonly op: "replace";
      readonly path: Path;
      readonly before: DopData;
      readonly after: DopData;
    }
  | {
      readonly op: "remove";
      readonly path: Path;
      readonly before: DopData;
    };
