import { EngineInvariantError } from "../api/errors.js";
import type { DopData } from "../api/types.js";
import type { Change } from "./change.js";

type DopRecord = Readonly<Record<string, DopData>>;
type MutableDopRecord = Record<string, DopData>;

interface Ancestor {
  readonly record: DopRecord;
  readonly key: string;
}

const reservedKeys = new Set(["__proto__", "prototype", "constructor"]);

export function applyChanges(
  base: DopData,
  changes: readonly Change[],
): DopData {
  if (changes.length === 0) {
    return base;
  }

  for (const change of changes) {
    assertChangeShape(change);
  }

  const rootChanges = changes.filter((change) => change.path.length === 0);

  if (rootChanges.length > 0) {
    if (
      changes.length !== 1 ||
      rootChanges.length !== 1 ||
      rootChanges[0]?.op !== "replace"
    ) {
      invariant("A root change must be one replace operation.");
    }

    return rootChanges[0].after;
  }

  let result = base;

  for (const change of changes) {
    result = applyNestedChange(result, change);
  }

  return result;
}

function applyNestedChange(base: DopData, change: Change): DopData {
  const ancestors: Ancestor[] = [];
  let current = base;

  for (let index = 0; index < change.path.length - 1; index += 1) {
    const key = change.path[index];

    if (key === undefined) {
      invariant("A change path must contain string segments.");
    }

    const record = requireRecord(current);
    const child = getOwnValue(record, key);
    ancestors.push({ record, key });
    current = child;
  }

  const parent = requireRecord(current);
  const leaf = change.path.at(-1);

  if (leaf === undefined) {
    invariant("A nested change requires a non-empty path.");
  }

  const hasLeaf = Object.hasOwn(parent, leaf);

  if (change.op === "add" ? hasLeaf : !hasLeaf) {
    invariant("A change does not match the current own-property state.");
  }

  let rebuilt = cloneRecord(parent);

  if (change.op === "remove") {
    if (!Reflect.deleteProperty(rebuilt, leaf)) {
      invariant("Failed to remove an own data property.");
    }
  } else {
    defineValue(rebuilt, leaf, change.after);
  }

  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const ancestor = ancestors[index];

    if (ancestor === undefined) {
      continue;
    }

    const parentClone = cloneRecord(ancestor.record);
    defineValue(parentClone, ancestor.key, rebuilt);
    rebuilt = parentClone;
  }

  return rebuilt;
}

function assertChangeShape(change: Change): void {
  if (typeof change !== "object" || change === null || Array.isArray(change)) {
    invariant("A change must be an object.");
  }

  const op = getChangeField(change, "op");
  const path = getChangeField(change, "path");

  if (op !== "add" && op !== "replace" && op !== "remove") {
    invariant("A change has an invalid operation.");
  }

  if (!Array.isArray(path)) {
    invariant("A change path must be an array.");
  }

  for (const segment of path) {
    if (typeof segment !== "string" || reservedKeys.has(segment)) {
      invariant("A change path contains an invalid segment.");
    }
  }

  if (op !== "add") {
    getChangeField(change, "before");
  }

  if (op !== "remove") {
    getChangeField(change, "after");
  }
}

function getChangeField(change: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(change, key);

  if (
    descriptor === undefined ||
    !descriptor.enumerable ||
    !("value" in descriptor)
  ) {
    invariant("A change is missing an own data field.");
  }

  return descriptor.value;
}

function requireRecord(value: DopData): DopRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    invariant("A change path must traverse records only.");
  }

  const prototype = Object.getPrototypeOf(value);

  if (prototype !== Object.prototype && prototype !== null) {
    invariant("A change path must traverse supported records only.");
  }

  return value as DopRecord;
}

function getOwnValue(record: DopRecord, key: string): DopData {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);

  if (
    descriptor === undefined ||
    !descriptor.enumerable ||
    !("value" in descriptor)
  ) {
    invariant("A change path must traverse enumerable own data properties.");
  }

  return descriptor.value as DopData;
}

function cloneRecord(record: DopRecord): MutableDopRecord {
  const clone = Object.create(
    Object.getPrototypeOf(record),
  ) as MutableDopRecord;

  for (const key of Reflect.ownKeys(record)) {
    if (typeof key !== "string" || reservedKeys.has(key)) {
      invariant("A record contains an invalid own key.");
    }

    defineValue(clone, key, getOwnValue(record, key));
  }

  return clone;
}

function defineValue(
  record: MutableDopRecord,
  key: string,
  value: DopData,
): void {
  Object.defineProperty(record, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

function invariant(message: string): never {
  throw new EngineInvariantError(message);
}
