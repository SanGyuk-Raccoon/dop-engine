import type { DopData } from "../api/types.js";
import type { Change, Path } from "./change.js";

type DopRecord = Readonly<Record<string, DopData>>;

interface CompareWork {
  readonly kind: "compare";
  readonly previous: DopData;
  readonly target: DopData;
  readonly path: Path;
}

interface EmitWork {
  readonly kind: "emit";
  readonly change: Change;
}

type DiffWork = CompareWork | EmitWork;

export function diffDopData(
  previous: DopData,
  target: DopData,
): readonly Change[] {
  const changes: Change[] = [];
  const work: DiffWork[] = [{ kind: "compare", previous, target, path: [] }];

  for (let item = work.pop(); item !== undefined; item = work.pop()) {
    if (item.kind === "emit") {
      changes.push(item.change);
      continue;
    }

    if (Object.is(item.previous, item.target)) {
      continue;
    }

    if (isRecord(item.previous) && isRecord(item.target)) {
      enqueueRecordDiff(item, work);
      continue;
    }

    changes.push({
      op: "replace",
      path: item.path,
      before: item.previous,
      after: item.target,
    });
  }

  return changes;
}

function enqueueRecordDiff(item: CompareWork, work: DiffWork[]): void {
  const previous = item.previous as DopRecord;
  const target = item.target as DopRecord;
  const keys = [...new Set([...Object.keys(previous), ...Object.keys(target)])];
  keys.sort(compareKeys);

  for (let index = keys.length - 1; index >= 0; index -= 1) {
    const key = keys[index];

    if (key === undefined) {
      continue;
    }

    const path = [...item.path, key];
    const hasPrevious = Object.hasOwn(previous, key);
    const hasTarget = Object.hasOwn(target, key);

    if (!hasPrevious) {
      work.push({
        kind: "emit",
        change: {
          op: "add",
          path,
          after: target[key] as DopData,
        },
      });
      continue;
    }

    if (!hasTarget) {
      work.push({
        kind: "emit",
        change: {
          op: "remove",
          path,
          before: previous[key] as DopData,
        },
      });
      continue;
    }

    work.push({
      kind: "compare",
      previous: previous[key] as DopData,
      target: target[key] as DopData,
      path,
    });
  }
}

function isRecord(value: DopData): value is DopRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compareKeys(left: string, right: string): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}
