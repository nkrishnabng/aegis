import type { ElementSelector, TestCaseRecord, TestDataSetRecord, TestStepRecord } from "@testingmcp/shared";

/** Slugifies a test case title into a safe `.spec.ts` filename -- shared by
 * the single-test-case export route and the multi-test-case CI zip export so
 * there's one canonical implementation. */
export function fileNameFor(title: string): string {
  return `${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.spec.ts`;
}

const ENV_PLACEHOLDER = /\{\{\s*env\.([\w-]+)\s*\}\}/g;
const PLACEHOLDER = /\{\{\s*(?:env\.([\w-]+)|data\.([\w-]+))\s*\}\}/g;

/** Every distinct `{{env.KEY}}` credential key referenced anywhere in a test
 * case's steps -- used by the CI zip exporter to tell the user which
 * `process.env` variables their standalone run needs to supply. */
export function collectEnvKeys(testCase: TestCaseRecord): string[] {
  const keys = new Set<string>();
  for (const step of testCase.steps) {
    for (const match of (step.value ?? "").matchAll(ENV_PLACEHOLDER)) {
      keys.add(match[1]);
    }
  }
  return [...keys];
}

/** Slug a data-set column name into a safe env-var-name fragment (mirrors
 * `dataSecretEnvVar` below -- kept as a plain string op so callers that just
 * want the fragment, e.g. the README env-var listing, don't need a row
 * index). */
function columnSlug(column: string): string {
  return column.replace(/[^a-zA-Z0-9]+/g, "_").toUpperCase();
}

/** The env var name a given row/column's secret value is sourced from in an
 * exported data-driven spec -- never inlined as a literal, since the
 * exported file is meant to be checked into source control. */
function dataSecretEnvVar(rowIndex: number, column: string): string {
  return `DATA_SECRET_${rowIndex}_${columnSlug(column)}`;
}

/** Every `DATA_SECRET_<row>_<COLUMN>` env var name an exported data-driven
 * spec for this test case + data set will reference -- used by the CI zip
 * exporter's README (same purpose as collectEnvKeys, for the data-set case). */
export function collectDataSecretEnvKeys(dataSet: TestDataSetRecord | null): string[] {
  if (!dataSet) return [];
  const keys: string[] = [];
  dataSet.rows.forEach((_row, i) => {
    for (const col of dataSet.secretColumns) keys.push(dataSecretEnvVar(i, col));
  });
  return keys;
}

/** Exported scripts run standalone (e.g. in CI), not through this app's
 * server, so a `{{env.KEY}}` credential placeholder -- substituted with a
 * decrypted value server-side at live-execution time (see executor.ts's
 * substituteCredentials) and never otherwise resolved -- must instead become
 * a real `process.env.KEY` reference the CI runner supplies. Likewise a
 * `{{data.COLUMN}}` placeholder becomes a `row.COLUMN`-equivalent property
 * access into the data-driven loop's current row (see
 * exportTestCaseAsPlaywrightScript) when a data set is present, or is left
 * as literal placeholder text otherwise (same honest fallback as an
 * unresolved `{{env.KEY}}` at live-execution time). This can't be a plain
 * string replace: the call sites below wrap `value` in `js()`
 * (`JSON.stringify`), and naively substituting text first would just quote
 * the literal string `"process.env.KEY"` instead of emitting a property
 * access. So this returns a JS *expression*. */
function valueExpression(value: string, hasDataSet: boolean): string {
  PLACEHOLDER.lastIndex = 0;
  if (!PLACEHOLDER.test(value)) {
    return js(value);
  }
  PLACEHOLDER.lastIndex = 0;
  const parts: string[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = PLACEHOLDER.exec(value)) !== null) {
    if (match.index > lastIndex) {
      parts.push(js(value.slice(lastIndex, match.index)));
    }
    const [, envKey, dataKey] = match;
    if (envKey) {
      parts.push(`process.env.${envKey}`);
    } else if (dataKey && hasDataSet) {
      parts.push(`row[${js(dataKey)}]`);
    } else {
      parts.push(js(match[0]));
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < value.length) {
    parts.push(js(value.slice(lastIndex)));
  }
  return parts.length === 1 ? parts[0] : `(${parts.join(" + ")})`;
}

/** Deterministically compiles a saved TestCase into a runnable
 * `@playwright/test` spec file. No LLM call involved -- the selector
 * descriptors and step actions already fully determine the output, using
 * the same resilient-locator priority the agent used to author them.
 *
 * When `dataSet` is provided (and has rows), the whole test is wrapped in a
 * loop over its rows -- one `test(...)` per row, each with its own `row`
 * variable that `{{data.COLUMN}}` step values compile to a property access
 * on. Secret columns are never inlined as literals: each becomes a
 * `process.env.DATA_SECRET_<row>_<COLUMN>` reference instead (see
 * `collectDataSecretEnvKeys`), so the exported file stays safe to commit. */
export function exportTestCaseAsPlaywrightScript(
  testCase: TestCaseRecord,
  dataSet?: TestDataSetRecord | null,
): string {
  const hasDataSet = !!dataSet && dataSet.rows.length > 0;
  const steps = testCase.steps.slice().sort((a, b) => a.order - b.order);

  const bodyLines: string[] = [];
  for (const step of steps) {
    if (!step.enabled) {
      bodyLines.push(`// Step ${step.order} (disabled, skipped): ${step.description}`);
      bodyLines.push("");
      continue;
    }
    bodyLines.push(`// Step ${step.order}: ${step.description}`);
    const warning = ambiguityWarning(step.selector ?? null);
    if (warning) bodyLines.push(`// ${warning}`);
    bodyLines.push(stepToCode(step, hasDataSet));
    bodyLines.push("");
  }
  const body = bodyLines.join("\n");

  const lines: string[] = [];
  lines.push(`import { test, expect } from '@playwright/test';`);
  lines.push("");
  lines.push(`// ${testCase.title}`);
  lines.push(`// Objective: ${testCase.objective}`);
  lines.push(`// Preconditions: ${testCase.preconditions}`);
  lines.push(`// Priority: ${testCase.priority} | Type: ${testCase.type}`);

  if (hasDataSet) {
    lines.push(...dataArrayLines(dataSet!));
    lines.push("");
    lines.push(`for (const [rowIndex, row] of DATA.entries()) {`);
    lines.push(indent(`test(\`${escapeForComment(testCase.title)} [row \${rowIndex}]\`, async ({ page }) => {`));
    lines.push(indent(indent(body)));
    lines.push(indent(`});`));
    lines.push(`}`);
  } else {
    lines.push(`test('${escapeForComment(testCase.title)}', async ({ page }) => {`);
    lines.push(indent(body));
    lines.push(`});`);
  }
  return lines.join("\n");
}

/** `const DATA = [...]` literal for the data-driven loop -- secret columns
 * become raw `process.env.DATA_SECRET_<row>_<COLUMN>` property-access
 * expressions (not JSON.stringify'd, so they compile as code, not a string),
 * non-secret columns are inlined as real string literals. */
function dataArrayLines(dataSet: TestDataSetRecord): string[] {
  const secretSet = new Set(dataSet.secretColumns);
  const rowsSource = dataSet.rows
    .map((row, i) => {
      const fields = dataSet.columns.map((col) => {
        const expr = secretSet.has(col) ? `process.env.${dataSecretEnvVar(i, col)}` : js(row[col] ?? "");
        return `${js(col)}: ${expr}`;
      });
      return `  { ${fields.join(", ")} },`;
    })
    .join("\n");
  return [`const DATA = [`, rowsSource, `];`];
}

function indent(code: string): string {
  return code
    .split("\n")
    .map((l) => `  ${l}`)
    .join("\n");
}

function escapeForComment(text: string): string {
  return text.replace(/'/g, "\\'");
}

function locatorExpression(selector: ElementSelector): string {
  switch (selector.strategy) {
    case "role":
      return selector.name
        ? `page.getByRole(${js(selector.role ?? "generic")}, { name: ${js(selector.name)} })`
        : `page.getByRole(${js(selector.role ?? "generic")})`;
    case "label":
      return `page.getByLabel(${js(selector.label ?? selector.description)})`;
    case "placeholder":
      return `page.getByPlaceholder(${js(selector.placeholder ?? selector.description)})`;
    case "text":
      return `page.getByText(${js(selector.name ?? selector.description)})`;
    case "altText":
      return `page.getByAltText(${js(selector.altText ?? selector.description)})`;
    case "testId":
      return `page.getByTestId(${js(selector.testId ?? selector.description)})`;
    case "xpath":
      return `page.locator(${js(`xpath=${selector.xpath ?? ""}`)})`;
    case "css":
    default:
      return `page.locator(${js(selector.css ?? selector.description)})`;
  }
}

function js(value: string): string {
  return JSON.stringify(value);
}

// The exporter is deterministic and doesn't load a live page (no LLM call,
// no browser), so it can't tell whether a "text"/"css"/"xpath" locator --
// the strategies with no built-in uniqueness guarantee, unlike role+name,
// label, placeholder, testId, or altText -- actually matches exactly one
// element on the real page. Playwright throws a clear strict-mode-violation
// error at run time if it doesn't, but flag it here too so a reviewer
// doesn't have to hit that failure first to know why.
function ambiguityWarning(selector: ElementSelector | null): string | null {
  if (!selector) return null;
  switch (selector.strategy) {
    case "text":
      return "NOTE: getByText() matches every element with this text, not just one -- if Playwright throws a strict-mode violation here, narrow it with .first()/.nth() or an additional filter.";
    case "css":
      return "NOTE: this CSS selector isn't guaranteed unique -- if Playwright throws a strict-mode violation here, narrow it with .first()/.nth() or a more specific selector.";
    case "xpath":
      return "NOTE: this XPath isn't guaranteed unique -- if Playwright throws a strict-mode violation here, narrow it with .first()/.nth() or a more specific expression.";
    default:
      return null;
  }
}

function stepToCode(step: TestStepRecord, hasDataSet: boolean): string {
  const value = step.value ?? "";
  const locator = step.selector ? locatorExpression(step.selector) : null;

  switch (step.action) {
    case "navigate":
      return `await page.goto(${valueExpression(value, hasDataSet)});`;
    case "click":
      return `await ${locator}.click();`;
    case "check":
      return `await ${locator}.check();`;
    case "uncheck":
      return `await ${locator}.uncheck();`;
    case "hover":
      return `await ${locator}.hover();`;
    case "fill":
      return `await ${locator}.fill(${valueExpression(value, hasDataSet)});`;
    case "select":
      return `await ${locator}.selectOption(${valueExpression(value, hasDataSet)});`;
    case "press":
      return `await page.keyboard.press(${js(value || "Enter")});`;
    case "waitFor": {
      const numeric = Number(value);
      if (value && !Number.isNaN(numeric)) {
        return `await page.waitForTimeout(${numeric});`;
      }
      return `await expect(page.getByText(${valueExpression(value, hasDataSet)})).toBeVisible();`;
    }
    case "assertVisible":
      return `await expect(${locator}).toBeVisible();`;
    case "assertText":
      return `await expect(page.locator('body')).toContainText(${valueExpression(value, hasDataSet)});`;
    case "assertUrl":
      return `await expect(page).toHaveURL(/${escapeForRegex(value)}/);`;
    case "screenshot":
      return `await page.screenshot({ path: 'step-${step.order}.png' });`;
    case "assertEnabled":
      return `await expect(${locator}).toBeEnabled();`;
    case "assertDisabled":
      return `await expect(${locator}).toBeDisabled();`;
    case "assertTableContains":
      return `await expect(${locator}).toContainText(${valueExpression(value, hasDataSet)});`;
    case "assertFormValid":
      return formValidCode(locator, value);
    case "assertApiResponse":
      return apiResponseCode(value);
    case "assertAccessible":
      return accessibleCode(locator);
    case "assertVisualMatch":
      // NOTE: this app's visual-regression baselines (VisualBaseline rows +
      // files under VISUAL_REGRESSION_DIR) aren't portable to a standalone
      // export -- this captures a screenshot for manual comparison instead.
      // To get real automated visual assertions in this exported project,
      // add Playwright's own `await expect(page).toHaveScreenshot(...)` and
      // generate its baseline via `--update-snapshots` here.
      return `// Visual-regression baseline not exported -- see comment above.\nawait page.screenshot({ path: 'step-${step.order}-visual.png' });`;
    default:
      return `// TODO: unsupported action "${step.action}"`;
  }
}

// `value` convention: "valid" or "invalid[:expected validation message substring]" --
// must stay in sync with the identical parsing in executor.ts's assertFormValid case
// (the exporter has no runtime dependency on the executor by design).
function formValidCode(locator: string | null, value: string): string {
  const [expectedRaw, ...rest] = (value || "valid").split(":");
  const expectedValid = expectedRaw.trim().toLowerCase() !== "invalid";
  const expectedSubstring = rest.join(":").trim();
  const lines = [
    `await expect.poll(() => ${locator}.evaluate((el) => (typeof el.checkValidity === 'function' ? el.checkValidity() : true))).toBe(${expectedValid});`,
  ];
  if (expectedSubstring) {
    lines.push(
      `await expect.poll(() => ${locator}.evaluate((el) => el.validationMessage || '')).toContain(${js(expectedSubstring)});`,
    );
  }
  return lines.join("\n");
}

// `value` convention: JSON string {"urlPattern": "...", "expectedStatus": 200}.
// NOTE: this is forward-looking (page.waitForResponse must be attached before the
// triggering request fires), unlike the live executor's retroactive network-log query --
// a request that already completed before this line runs won't be observed here.
function apiResponseCode(value: string): string {
  let criteria: { urlPattern: string; expectedStatus: number } | null = null;
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed.urlPattern === "string" && typeof parsed.expectedStatus === "number") {
      criteria = parsed;
    }
  } catch {
    // handled by the null check below
  }
  if (!criteria) {
    return `// TODO: assertApiResponse requires a value like {"urlPattern": "/api/login", "expectedStatus": 200}, got: ${js(value)}`;
  }
  return (
    `await expect.poll(async () => {\n` +
    `  const res = await page.waitForResponse((r) => r.url().includes(${js(criteria.urlPattern)}), { timeout: 5000 }).catch(() => null);\n` +
    `  return res ? res.status() : null;\n` +
    `}).toBe(${criteria.expectedStatus});`
  );
}

// Lightweight accessible-name heuristic -- mirrors executor.ts's ACCESSIBLE_NAME_CHECK_FN
// but re-expressed as real (non-stringified) JS since it runs inside the exported
// script directly, not via an MCP browser_evaluate call. NOT a full axe-core audit.
function accessibleCode(locator: string | null): string {
  return (
    `await expect.poll(() => ${locator}.evaluate((element) => {\n` +
    `  const tag = element.tagName.toLowerCase();\n` +
    `  const ariaLabel = element.getAttribute('aria-label') || '';\n` +
    `  const labelledBy = element.getAttribute('aria-labelledby');\n` +
    `  let labelledText = '';\n` +
    `  if (labelledBy) { labelledText = labelledBy.split(' ').map((id) => { const n = document.getElementById(id); return n ? n.textContent : ''; }).join(' '); }\n` +
    `  let name = '';\n` +
    `  if (tag === 'img') { name = element.getAttribute('alt') || ''; }\n` +
    `  else if (tag === 'input' || tag === 'select' || tag === 'textarea') { const lbl = (element.labels && element.labels.length > 0) ? element.labels[0].textContent : ''; name = ariaLabel || labelledText || lbl || ''; }\n` +
    `  else { name = ariaLabel || labelledText || element.textContent || ''; }\n` +
    `  return !!name.trim();\n` +
    `})).toBe(true);`
  );
}

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}
