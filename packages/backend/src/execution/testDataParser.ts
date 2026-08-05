export interface ParsedTestData {
  columns: string[];
  rows: Record<string, string>[];
}

export class TestDataParseError extends Error {}

/** Minimal RFC4180-ish CSV parser: quoted fields (with embedded commas,
 * newlines, and escaped `""` quotes), CRLF/LF line endings, first row as
 * the header. No external dependency -- the format is small and well-bounded
 * enough that a hand-rolled parser is simpler than adding one. */
export function parseCsv(text: string): ParsedTestData {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  function endField() {
    row.push(field);
    field = "";
  }
  function endRow() {
    endField();
    rows.push(row);
    row = [];
  }

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      endField();
      i++;
      continue;
    }
    if (ch === "\r") {
      i++;
      continue;
    }
    if (ch === "\n") {
      endRow();
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  // Trailing field/row (file may or may not end with a newline).
  if (field.length > 0 || row.length > 0) endRow();

  const nonEmptyRows = rows.filter((r) => !(r.length === 1 && r[0] === ""));
  if (nonEmptyRows.length < 2) {
    throw new TestDataParseError("CSV must have a header row plus at least one data row.");
  }
  const [header, ...dataRows] = nonEmptyRows;
  const columns = header.map((c) => c.trim()).filter(Boolean);
  if (columns.length === 0) {
    throw new TestDataParseError("CSV header row has no column names.");
  }
  const parsedRows = dataRows.map((r) => {
    const record: Record<string, string> = {};
    columns.forEach((col, idx) => {
      record[col] = r[idx] ?? "";
    });
    return record;
  });
  return { columns, rows: parsedRows };
}

/** Expects a JSON array of flat objects (string/number/boolean values --
 * everything else is coerced to its JSON string form). Column order follows
 * first-appearance across all rows, so rows with differing keys still merge
 * into one consistent column set (missing values become ""). */
export function parseJsonTestData(text: string): ParsedTestData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new TestDataParseError(`Invalid JSON: ${(err as Error).message}`);
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new TestDataParseError("JSON test data must be a non-empty array of objects.");
  }

  const columns: string[] = [];
  const seen = new Set<string>();
  for (const item of parsed) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new TestDataParseError("Every element of the JSON array must be a flat object.");
    }
    for (const key of Object.keys(item as Record<string, unknown>)) {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }
  }

  const rows = (parsed as Record<string, unknown>[]).map((item) => {
    const record: Record<string, string> = {};
    for (const col of columns) {
      const value = item[col];
      record[col] = value === undefined || value === null ? "" : typeof value === "string" ? value : JSON.stringify(value);
    }
    return record;
  });

  return { columns, rows };
}

export function parseTestData(text: string, format: "csv" | "json"): ParsedTestData {
  return format === "csv" ? parseCsv(text) : parseJsonTestData(text);
}
