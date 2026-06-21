import fs from "node:fs";
import { z } from "zod";
import type { CycodeTool } from "../types.js";
import { resolveIn } from "../../util/paths.js";
import { applyEdit } from "./apply-edit.js";

export const multiEditTool: CycodeTool<{
  file_path: string;
  edits: { old_string: string; new_string: string; replace_all?: boolean }[];
}> = {
  name: "multi_edit",
  description:
    "Apply several exact-string edits to one file in order, atomically (all succeed or " +
    "none are written). Each edit matches like the edit tool. Use this to make multiple " +
    "changes to the same file in a single step.",
  inputSchema: z.object({
    file_path: z.string(),
    edits: z
      .array(
        z.object({
          old_string: z.string(),
          new_string: z.string(),
          replace_all: z.boolean().optional(),
        }),
      )
      .min(1),
  }),
  readOnly: false,
  permissionKey: (i) => `edit(${i.file_path})`,
  describeCall: (i) => `multi_edit(${i.file_path}, ${i.edits.length} edits)`,
  async execute(input, ctx) {
    const file = resolveIn(ctx.cwd, input.file_path);
    if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`);
    let content = fs.readFileSync(file, "utf8");
    let total = 0;
    input.edits.forEach((edit, i) => {
      try {
        const res = applyEdit(content, edit);
        content = res.content;
        total += res.count;
      } catch (err) {
        // nothing is written unless all edits apply
        throw new Error(`edit ${i + 1}/${input.edits.length} failed: ${err instanceof Error ? err.message : err}`);
      }
    });
    fs.writeFileSync(file, content);
    let result = `Applied ${input.edits.length} edits to ${file} (${total} replacements)`;
    const diag = await ctx.runDiagnostics();
    if (diag) result += `\n\nDIAGNOSTICS (fix before proceeding):\n${diag}`;
    return result;
  },
};
