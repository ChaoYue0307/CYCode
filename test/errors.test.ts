import { describe, expect, it } from "vitest";
import { errorMessage } from "../src/util/errors.js";

describe("errorMessage", () => {
  it("uses Error.message", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
  });

  it("returns strings as-is", () => {
    expect(errorMessage("plain")).toBe("plain");
  });

  it("never produces [object Object] for plain error objects", () => {
    expect(errorMessage({ message: "bad key" })).toBe("bad key");
    expect(errorMessage({ error: "rate limited" })).toBe("rate limited");
    expect(errorMessage({ error: { message: "nested" } })).toBe("nested");
  });

  it("falls back to JSON for objects without a known field", () => {
    const out = errorMessage({ statusCode: 401, foo: "bar" });
    expect(out).not.toBe("[object Object]");
    expect(out).toContain("401");
  });

  it("prefers responseBody / statusText when present", () => {
    expect(errorMessage({ responseBody: "Invalid api key" })).toBe("Invalid api key");
    expect(errorMessage({ statusText: "Unauthorized" })).toBe("Unauthorized");
  });

  it("handles null and undefined", () => {
    expect(errorMessage(null)).toBe("null");
    expect(errorMessage(undefined)).toBe("undefined");
  });
});
