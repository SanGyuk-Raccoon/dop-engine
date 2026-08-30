import { describe, expect, it } from "vitest";

import { DopDataError } from "../../src/api/errors.js";
import { assertDopData } from "../../src/data/assert-dop-data.js";

function expectUnsupported(value: unknown): void {
  expect(() => assertDopData(value)).toThrow(DopDataError);
}

describe("assertDopData", () => {
  it.each([
    null,
    false,
    true,
    "",
    "data",
    0,
    -1,
    Number.MIN_VALUE,
    Number.MAX_VALUE,
  ])("accepts the supported primitive %j", (value) => {
    expect(() => assertDopData(value)).not.toThrow();
  });

  it("accepts nested records, dense arrays, and shared subtrees", () => {
    const shared = { enabled: true };
    const nullPrototypeRecord = Object.assign(Object.create(null), {
      shared,
      values: [null, "value", 42],
    }) as Record<string, unknown>;
    const value = {
      first: shared,
      second: shared,
      nested: nullPrototypeRecord,
    };

    expect(() => assertDopData(value)).not.toThrow();
    expect(value.first).toBe(value.second);
  });

  it("accepts frozen records and arrays without changing their descriptors", () => {
    const value = Object.freeze({
      nested: Object.freeze([Object.freeze({ value: "stable" })]),
    });
    const rootDescriptors = Object.getOwnPropertyDescriptors(value);
    const arrayDescriptors = Object.getOwnPropertyDescriptors(value.nested);

    assertDopData(value);

    expect(Object.getOwnPropertyDescriptors(value)).toEqual(rootDescriptors);
    expect(Object.getOwnPropertyDescriptors(value.nested)).toEqual(
      arrayDescriptors,
    );
  });

  it.each([
    undefined,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    1n,
    Symbol("value"),
    () => undefined,
  ])("rejects the unsupported primitive %s", (value) => {
    expectUnsupported(value);
  });

  it.each([
    new Date(),
    /value/u,
    new Map(),
    new Set(),
    Promise.resolve(),
    new (class Example {
      readonly value = "data";
    })(),
    Object.create({ inherited: true }),
  ])("rejects objects that are not plain current-realm records", (value) => {
    expectUnsupported(value);
  });

  it("rejects accessors without invoking them", () => {
    let accessCount = 0;
    const value = Object.defineProperty({}, "secret", {
      enumerable: true,
      get() {
        accessCount += 1;
        return "not-read";
      },
    });

    expectUnsupported(value);
    expect(accessCount).toBe(0);
  });

  it("rejects non-enumerable and symbol record properties", () => {
    const nonEnumerable = Object.defineProperty({}, "hidden", {
      value: true,
    });
    const symbolKeyed = { [Symbol("hidden")]: true };

    expectUnsupported(nonEnumerable);
    expectUnsupported(symbolKeyed);
  });

  it.each(["__proto__", "prototype", "constructor"])(
    "rejects the reserved key %s",
    (key) => {
      const value = Object.defineProperty({}, key, {
        configurable: true,
        enumerable: true,
        value: "blocked",
        writable: true,
      });

      expectUnsupported(value);
    },
  );

  it("rejects sparse arrays", () => {
    const trailingHole = ["first"];
    trailingHole.length = 2;

    const middleHole = ["first", "second", "third"];
    expect(Reflect.deleteProperty(middleHole, "1")).toBe(true);

    expectUnsupported(trailingHole);
    expectUnsupported(middleHole);
  });

  it("rejects array accessors without invoking them", () => {
    let accessCount = 0;
    const value: unknown[] = [];

    Object.defineProperty(value, "0", {
      configurable: true,
      enumerable: true,
      get() {
        accessCount += 1;
        return "not-read";
      },
    });

    expectUnsupported(value);
    expect(accessCount).toBe(0);
  });

  it("rejects array custom, symbol, and non-enumerable index properties", () => {
    const customProperty = Object.assign(["value"], { extra: true });
    const symbolProperty = ["value"];
    const nonEnumerableIndex = ["value"];

    Object.defineProperty(symbolProperty, Symbol("extra"), {
      value: true,
    });
    Object.defineProperty(nonEnumerableIndex, "0", {
      enumerable: false,
    });

    expectUnsupported(customProperty);
    expectUnsupported(symbolProperty);
    expectUnsupported(nonEnumerableIndex);
  });

  it("rejects arrays with a non-standard prototype", () => {
    class ExampleArray extends Array<unknown> {}

    expectUnsupported(ExampleArray.of("value"));
  });

  it("rejects direct and indirect cycles", () => {
    const direct: Record<string, unknown> = {};
    direct.self = direct;

    const first: Record<string, unknown> = {};
    const second: Record<string, unknown> = { first };
    first.second = second;

    expectUnsupported(direct);
    expectUnsupported(first);
  });
});
