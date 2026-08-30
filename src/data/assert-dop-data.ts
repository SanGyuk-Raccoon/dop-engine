import { DopDataError } from "../api/errors.js";
import type { DopData } from "../api/types.js";

const reservedKeys = new Set(["__proto__", "prototype", "constructor"]);

interface VisitFrame {
  readonly phase: "enter" | "leave";
  readonly value: object;
}

export function assertDopData(value: unknown): asserts value is DopData {
  const visiting = new WeakSet<object>();
  const verified = new WeakSet<object>();
  const frames: VisitFrame[] = [];

  inspectValue(value, frames, visiting, verified);

  for (let frame = frames.pop(); frame !== undefined; frame = frames.pop()) {
    if (frame.phase === "leave") {
      visiting.delete(frame.value);
      verified.add(frame.value);
      continue;
    }

    inspectValue(frame.value, frames, visiting, verified);
  }
}

function inspectValue(
  value: unknown,
  frames: VisitFrame[],
  visiting: WeakSet<object>,
  verified: WeakSet<object>,
): void {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      unsupported("numbers must be finite");
    }

    return;
  }

  if (typeof value !== "object") {
    unsupported(
      "only null, booleans, strings, finite numbers, arrays, and plain records are supported",
    );
  }

  if (verified.has(value)) {
    return;
  }

  if (visiting.has(value)) {
    unsupported("cycles are not supported");
  }

  const children = Array.isArray(value)
    ? inspectArray(value)
    : inspectRecord(value);

  visiting.add(value);
  frames.push({ phase: "leave", value });

  for (let index = children.length - 1; index >= 0; index -= 1) {
    const child = children[index];

    if (typeof child === "object" && child !== null) {
      frames.push({ phase: "enter", value: child });
    } else {
      inspectValue(child, frames, visiting, verified);
    }
  }
}

function inspectRecord(value: object): unknown[] {
  const prototype = Object.getPrototypeOf(value);

  if (prototype !== Object.prototype && prototype !== null) {
    unsupported(
      "objects must use the current realm Object prototype or a null prototype",
    );
  }

  const children: unknown[] = [];

  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") {
      unsupported("symbol keys are not supported");
    }

    if (reservedKeys.has(key)) {
      unsupported("reserved keys are not supported");
    }

    const descriptor = Object.getOwnPropertyDescriptor(value, key);

    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    ) {
      unsupported("record properties must be enumerable own data properties");
    }

    children.push(descriptor.value);
  }

  return children;
}

function inspectArray(value: readonly unknown[]): unknown[] {
  if (Object.getPrototypeOf(value) !== Array.prototype) {
    unsupported("arrays must use the current realm Array prototype");
  }

  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");

  if (
    lengthDescriptor === undefined ||
    !("value" in lengthDescriptor) ||
    typeof lengthDescriptor.value !== "number" ||
    !Number.isInteger(lengthDescriptor.value) ||
    lengthDescriptor.value < 0 ||
    lengthDescriptor.enumerable ||
    lengthDescriptor.configurable
  ) {
    unsupported("arrays must have a standard length property");
  }

  const length = lengthDescriptor.value;
  const children: unknown[] = [];

  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") {
      unsupported("array symbol keys are not supported");
    }

    if (key === "length") {
      continue;
    }

    if (!isArrayIndex(key, length)) {
      unsupported("array custom properties are not supported");
    }

    const descriptor = Object.getOwnPropertyDescriptor(value, key);

    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    ) {
      unsupported("array indexes must be enumerable own data properties");
    }

    children.push(descriptor.value);
  }

  if (children.length !== length) {
    unsupported("sparse arrays are not supported");
  }

  return children;
}

function isArrayIndex(key: string, length: number): boolean {
  const index = Number(key);

  return (
    Number.isInteger(index) &&
    index >= 0 &&
    index < length &&
    String(index) === key
  );
}

function unsupported(reason: string): never {
  throw new DopDataError(`Unsupported DOP data: ${reason}.`);
}
