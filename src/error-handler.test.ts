import { describe, it, expect } from "vitest";
import {
  getErrorMessage,
  formatError,
} from "./error-handler";

describe("getErrorMessage", () => {
  it("extracts message from Error instances", () => {
    expect(getErrorMessage(new Error("disk full"))).toBe("disk full");
  });

  it("returns string values directly", () => {
    expect(getErrorMessage("something broke")).toBe("something broke");
  });

  it("extracts .message from objects with a message property", () => {
    expect(getErrorMessage({ message: "network timeout" })).toBe("network timeout");
  });

  it("converts non-message objects to string", () => {
    expect(getErrorMessage(42)).toBe("42");
    expect(getErrorMessage(null)).toBe("null");
    expect(getErrorMessage(undefined)).toBe("undefined");
  });

  it("handles objects with non-string message", () => {
    expect(getErrorMessage({ message: 123 })).toBe("123");
  });
});

describe("formatError", () => {
  it("combines prefix with error message", () => {
    expect(formatError("Failed to save", new Error("disk full"))).toBe(
      "Failed to save: disk full"
    );
  });

  it("returns prefix alone when error has no message", () => {
    expect(formatError("Operation failed", "")).toBe("Operation failed");
  });

  it("handles string errors", () => {
    expect(formatError("Save error", "permission denied")).toBe(
      "Save error: permission denied"
    );
  });
});
