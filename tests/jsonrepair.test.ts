import { describe, expect, it } from "vitest";
import { extractJson } from "@/server/llm/json-repair";

describe("extractJson", () => {
  it("parses bare JSON", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });
  it("parses fenced JSON", () => {
    expect(extractJson('here you go:\n```json\n{"a": [1,2]}\n```')).toEqual({ a: [1, 2] });
  });
  it("strips think blocks", () => {
    expect(extractJson('<think>hmm</think>{"a":true}')).toEqual({ a: true });
  });
  it("skips leading prose", () => {
    expect(extractJson('Sure! {"a":"x"} that is all')).toEqual({ a: "x" });
  });
  it("handles nested braces and strings with braces", () => {
    expect(extractJson('{"a":"{not a brace}","b":{"c":2}}')).toEqual({
      a: "{not a brace}",
      b: { c: 2 },
    });
  });
  it("returns undefined for non-JSON", () => {
    expect(extractJson("no json here")).toBeUndefined();
  });
  it("parses arrays", () => {
    expect(extractJson('[1,2,{"a":3}]')).toEqual([1, 2, { a: 3 }]);
  });
});
