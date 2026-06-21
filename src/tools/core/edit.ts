import fs from "node:fs";
import { z } from "zod";
import type { CycodeTool } from "../types.js";
import { resolveIn } from "../../util/paths.js";
import { applyEdit } from "./apply-edit.js";

export const editTool: CycodeTool<{
  file_path: string;
  old_string: string;
  new_string: string;
  replace_all?: boolean;
}> = {
  name: "edit",
  description:
    "Replace an exact string in a file. old_string must match the file content exactly " +
    "(including indentation) and must be unique unless replace_all is true. " +
    "CRLF/LF line-ending mismatches are tolerated automatically.",
  inputSchema: z.object({
    file_path: z.string(),
    old_string: z.string(),
    new_string: z.string(),
    replace_all: z.boolean().optional(),
  }),
  readOnly: false,
  permissionKey: (i) => `edit(${i.file_path})`,
  describeCall: (i) => `edit(${i.file_path})`,
  async execute(input, ctx) {
    const file = resolveIn(ctx.cwd, input.file_path);
    if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`);
    const content = fs.readFileSync(file, "utf8");
    const { content: next, count } = applyEdit(content, input);
    fs.writeFileSync(file, next);
    let result = `Edited ${file} (${count} replacement${count === 1 ? "" : "s"})`;
    const diag = await ctx.runDiagnostics();
    if (diag) result += `\n\nDIAGNOSTICS (fix before proceeding):\n${diag}`;
    return result;
  },
};
