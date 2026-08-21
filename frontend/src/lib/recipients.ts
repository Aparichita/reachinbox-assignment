const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const EMAIL_HEADER_NAMES = new Set([
  "email",
  "e-mail",
  "recipient",
  "recipient_email",
  "address",
]);

export type ParseRecipientsResult = {
  emails: string[];
  skippedCount: number;
};

function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value.trim());
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function splitCsvLine(line: string): string[] {
  return line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, ""));
}

function collectFromCells(cells: string[]): {
  emails: string[];
  skippedCount: number;
} {
  const emails: string[] = [];
  let skippedCount = 0;

  for (const cell of cells) {
    const trimmed = cell.trim();

    if (!trimmed) {
      continue;
    }

    if (isValidEmail(trimmed)) {
      emails.push(normalizeEmail(trimmed));
    } else {
      skippedCount += 1;
    }
  }

  return { emails, skippedCount };
}

export function parseRecipientsFromText(text: string): ParseRecipientsResult {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { emails: [], skippedCount: 0 };
  }

  const collected: string[] = [];
  let skippedCount = 0;

  const firstLineCells = splitCsvLine(lines[0]);
  const headerLooksLikeCsv =
    lines.length > 1 &&
    firstLineCells.some((cell) => EMAIL_HEADER_NAMES.has(cell.toLowerCase()));

  if (headerLooksLikeCsv) {
    const headers = firstLineCells.map((cell) => cell.toLowerCase());
    const emailColumnIndex = headers.findIndex((header) =>
      EMAIL_HEADER_NAMES.has(header)
    );

    for (let index = 1; index < lines.length; index += 1) {
      const cells = splitCsvLine(lines[index]);
      const candidate = cells[emailColumnIndex]?.trim();

      if (!candidate) {
        skippedCount += 1;
        continue;
      }

      if (isValidEmail(candidate)) {
        collected.push(normalizeEmail(candidate));
      } else {
        skippedCount += 1;
      }
    }
  } else {
    for (const line of lines) {
      const parts = line.includes(",") ? splitCsvLine(line) : [line];
      const result = collectFromCells(parts);
      collected.push(...result.emails);
      skippedCount += result.skippedCount;
    }
  }

  return {
    emails: [...new Set(collected)],
    skippedCount,
  };
}

export function dedupeRecipients(recipients: string[]): string[] {
  return [...new Set(recipients.map(normalizeEmail))];
}
