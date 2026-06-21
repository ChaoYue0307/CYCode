import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyEdit } from "../src/tools/core/apply-edit.js";
import { multiEditTool } from "../src/tools/core/multi_edit.js";
import { editTool } from "../src/tools/core/edit.js";
import { makeCtx, makeTmpDir } from "./helpers.js";

describe("applyEdit", () => {
  it("replaces a unique exact match", () => {
    const { content, count } = applyEdit("a b c", { old_string: "b", new_string: "X" });
    expect(content).toBe("a X c");
    expect(count).toBe(1);
  });

  it("tolerates CRLF/LF mismatch (LF old_string against a CRLF file)", () => {
    const file = "line1\r\nline2\r\nline3";
    const { content } = applyEdit(file, { old_string: "line1\nline2", new_string: "ONE\nTWO" });
    expect(content).toBe("ONE\r\nTWO\r\nline3"); // new text normalized to the file's CRLF
  });

  it("throws on no match and on ambiguous match", () => {
    expect(() => applyEdit("abc", { old_string: "zzz", new_string: "y" })).toThrow(/not found/);
    expect(() => applyEdit("x x x", { old_string: "x", new_string: "y" })).toThrow(/occurs 3 times/);
    expect(() => applyEdit("x x", { old_string: "x", new_string: "y", replace_all: true }).content).not.toThrow;
  });

  it("rejects identical strings", () => {
    expect(() => applyEdit("a", { old_string: "a", new_string: "a" })).toThrow(/identical/);
  });
});

describe("multi_edit tool", () => {
  it("applies several edits atomically", async () => {
    const dir = makeTmpDir();
    const file = path.join(dir, "f.py");
    fs.writeFileSync(file, "a = 1\nb = 2\nc = 3\n");
    await multiEditTool.execute(
      {
        file_path: "f.py",
        edits: [
          { old_string: "a = 1", new_string: "a = 10" },
          { old_string: "c = 3", new_string: "c = 30" },
        ],
      },
      makeCtx(dir),
    );
    expect(fs.readFileSync(file, "utf8")).toBe("a = 10\nb = 2\nc = 30\n");
  });

  it("writes nothing if any edit fails", async () => {
    const dir = makeTmpDir();
    const file = path.join(dir, "f.py");
    const original = "a = 1\nb = 2\n";
    fs.writeFileSync(file, original);
    await expect(
      multiEditTool.execute(
        {
          file_path: "f.py",
          edits: [
            { old_string: "a = 1", new_string: "a = 10" },
            { old_string: "DOES NOT EXIST", new_string: "x" },
          ],
        },
        makeCtx(dir),
      ),
    ).rejects.toThrow(/edit 2\/2 failed/);
    expect(fs.readFileSync(file, "utf8")).toBe(original); // unchanged
  });

  it("sequential edits see prior edits' results", async () => {
    const dir = makeTmpDir();
    const file = path.join(dir, "f.txt");
    fs.writeFileSync(file, "hello world");
    await multiEditTool.execute(
      {
        file_path: "f.txt",
        edits: [
          { old_string: "hello", new_string: "hi" },
          { old_string: "hi world", new_string: "hi there" },
        ],
      },
      makeCtx(dir),
    );
    expect(fs.readFileSync(file, "utf8")).toBe("hi there");
  });
});

describe("edit tool with line-ending tolerance", () => {
  it("edits a CRLF file given an LF old_string", async () => {
    const dir = makeTmpDir();
    const file = path.join(dir, "win.txt");
    fs.writeFileSync(file, "alpha\r\nbeta\r\n");
    await editTool.execute({ file_path: "win.txt", old_string: "beta", new_string: "gamma" }, makeCtx(dir));
    expect(fs.readFileSync(file, "utf8")).toBe("alpha\r\ngamma\r\n");
  });
});
