import type { Conflict } from "../api/types.js";
import type { Path } from "./change.js";

export function classifyPathRelation(
  currentPath: Path,
  nextPath: Path,
): Conflict["relation"] | undefined {
  const sharedLength = Math.min(currentPath.length, nextPath.length);

  for (let index = 0; index < sharedLength; index += 1) {
    if (currentPath[index] !== nextPath[index]) {
      return undefined;
    }
  }

  if (currentPath.length === nextPath.length) {
    return "same";
  }

  return currentPath.length < nextPath.length ? "ancestor" : "descendant";
}

export function comparePaths(left: Path, right: Path): number {
  const sharedLength = Math.min(left.length, right.length);

  for (let index = 0; index < sharedLength; index += 1) {
    const leftSegment = left[index] as string;
    const rightSegment = right[index] as string;

    if (leftSegment < rightSegment) {
      return -1;
    }

    if (leftSegment > rightSegment) {
      return 1;
    }
  }

  return left.length - right.length;
}
