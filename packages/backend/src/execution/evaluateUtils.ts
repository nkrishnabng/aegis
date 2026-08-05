/** `browser_evaluate`'s text output wraps the actual JSON-stringified return
 * value between a "### Result" heading and a following "### Ran Playwright
 * code" heading that echoes the function's own source -- confirmed live
 * (e.g. `### Result\n"false"\n### Ran Playwright code\n\`\`\`js\n...\`\`\``).
 * A naive substring check against the raw text is corrupted by that echoed
 * source (a function containing the string "true" anywhere in its own body,
 * e.g. `=== 'true'`, would false-match). Extract just the result section and
 * unwrap its one layer of JSON-string encoding. */
export function extractEvaluateResultValue(text: string): string {
  const afterHeading = text.split(/###\s*Result/i)[1] ?? text;
  const resultSection = (afterHeading.split(/###\s*Ran Playwright code/i)[0] ?? afterHeading).trim();
  try {
    const parsed = JSON.parse(resultSection);
    return typeof parsed === "string" ? parsed : JSON.stringify(parsed);
  } catch {
    return resultSection;
  }
}
