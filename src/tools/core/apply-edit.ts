function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count++;
    idx += needle.length;
  }
  return count;
}

/** Convert a string's line endings to match the file's dominant style. */
function matchLineEndings(text: string, fileUsesCRLF: boolean): string {
  const normalized = text.replace(/\r\n/g, "\n");
  return fileUsesCRLF ? normalized.replace(/\n/g, "\r\n") : normalized;
}

export interface EditSpec {
  old_string: string;
  new_string: string;
  replace_all?: boolean;
}

/**
 * Apply one exact-string edit to `content`, returning the new content and the
 * replacement count. Tolerant of CRLF/LF line-ending mismatches (a common cause
 * of "not found" failures). Throws on no match, ambiguous match, or no-op.
 */
export function applyEdit(content: string, edit: EditSpec): { content: string; count: number } {
  if (edit.old_string === edit.new_string) {
    throw new Error("old_string and new_string are identical");
  }

  let oldStr = edit.old_string;
  let count = countOccurrences(content, oldStr);

  if (count === 0) {
    // retry with the file's line-ending style
    const fileUsesCRLF = content.includes("\r\n");
    const adjusted = matchLineEndings(oldStr, fileUsesCRLF);
    if (adjusted !== oldStr) {
      const adjustedCount = countOccurrences(content, adjusted);
      if (adjustedCount > 0) {
        oldStr = adjusted;
        count = adjustedCount;
      }
    }
  }

  if (count === 0) {
    throw new Error(
      "old_string not found in file. Read the file and match the content exactly (including indentation).",
    );
  }
  if (count > 1 && !edit.replace_all) {
    throw new Error(
      `old_string occurs ${count} times; add surrounding context to make it unique, or set replace_all`,
    );
  }

  const newStr = matchLineEndings(edit.new_string, content.includes("\r\n"));
  const next = edit.replace_all
    ? content.split(oldStr).join(newStr)
    : content.replace(oldStr, () => newStr);
  return { content: next, count };
}
