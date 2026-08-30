import { describe, expect, it } from "vitest";

import {
  classifyPathRelation,
  comparePaths,
} from "../../src/consistency/path.js";

describe("classifyPathRelation", () => {
  it("classifies identical root and nested paths as the same path", () => {
    expect(classifyPathRelation([], [])).toBe("same");
    expect(classifyPathRelation(["profile", "name"], ["profile", "name"])).toBe(
      "same",
    );
  });

  it("classifies a strict current prefix as an ancestor", () => {
    expect(classifyPathRelation([], ["profile"])).toBe("ancestor");
    expect(classifyPathRelation(["profile"], ["profile", "name"])).toBe(
      "ancestor",
    );
  });

  it("classifies a strict next prefix as a descendant", () => {
    expect(classifyPathRelation(["profile"], [])).toBe("descendant");
    expect(classifyPathRelation(["profile", "name"], ["profile"])).toBe(
      "descendant",
    );
  });

  it("keeps divergent segments and string prefixes independent", () => {
    expect(classifyPathRelation(["profile", "name"], ["profile", "age"])).toBe(
      undefined,
    );
    expect(classifyPathRelation(["user"], ["username"])).toBe(undefined);
  });
});

describe("comparePaths", () => {
  it("orders segments lexicographically with prefixes first", () => {
    const paths = [["z"], ["a", "z"], ["a"], [], ["a", "a"]];

    paths.sort(comparePaths);

    expect(paths).toEqual([[], ["a"], ["a", "a"], ["a", "z"], ["z"]]);
  });
});
