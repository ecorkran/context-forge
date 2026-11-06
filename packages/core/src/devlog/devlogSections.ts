/** Pure parsing of DEVLOG text into a preamble and dated day sections (slice 936, D2/D3). */

export interface DevlogQuarter {
  year: number;
  quarter: number;
}

export interface DevlogSection extends DevlogQuarter {
  /** The heading line without its line terminator. */
  heading: string;
  /** Exact source text from the heading to the next dated heading, line endings included. */
  text: string;
}

export interface ParsedDevlog {
  /** Everything above the first dated heading. */
  preamble: string;
  sections: DevlogSection[];
}

const FULL_COMPACT = /^##[ \t]+(\d{4})(\d{2})(\d{2})(?!\d)/;
const FULL_DASHED = /^##[ \t]+(\d{4})-(\d{2})-(\d{2})(?!\d)/;
const YEAR_MONTH = /^##[ \t]+(\d{4})-(\d{2})(?![\d-])/;
const FENCE = /^[ \t]*(`{3,}|~{3,})/;
const MONTHS_PER_QUARTER = 3;
const MAX_MONTH = 12;
const MAX_DAY = 31;

/** Quarter of a 1-based month. */
export function quarterOfMonth(month: number): number {
  return Math.ceil(month / MONTHS_PER_QUARTER);
}

/** Archive key such as `2026-Q3`. */
export function quarterKey({ year, quarter }: DevlogQuarter): string {
  return `${year}-Q${quarter}`;
}

/** The quarter a heading line names, or null when it is not a dated level-2 heading. */
export function headingQuarter(line: string): DevlogQuarter | null {
  const full = FULL_COMPACT.exec(line) ?? FULL_DASHED.exec(line);
  if (full) {
    const month = Number(full[2]);
    const day = Number(full[3]);
    return validMonth(month) && day >= 1 && day <= MAX_DAY
      ? { year: Number(full[1]), quarter: quarterOfMonth(month) }
      : null;
  }
  const ym = YEAR_MONTH.exec(line);
  if (ym && validMonth(Number(ym[2]))) {
    return { year: Number(ym[1]), quarter: quarterOfMonth(Number(ym[2])) };
  }
  return null;
}

function validMonth(month: number): boolean {
  return month >= 1 && month <= MAX_MONTH;
}

/** Split into lines that keep their terminators, so CRLF and a missing final newline survive. */
function splitKeepingTerminators(text: string): string[] {
  return text.length === 0 ? [] : text.split(/(?<=\n)/);
}

export function parseDevlog(text: string): ParsedDevlog {
  let preamble = '';
  const sections: DevlogSection[] = [];
  let current: {
    heading: string;
    quarter: DevlogQuarter;
    text: string;
  } | null = null;
  /** The opening fence marker while inside a code fence; a closing fence uses the same character, at least as long. */
  let openFence: string | null = null;

  const flush = (): void => {
    if (current)
      sections.push({
        heading: current.heading,
        ...current.quarter,
        text: current.text,
      });
  };

  for (const line of splitKeepingTerminators(text)) {
    const marker = FENCE.exec(line)?.[1] ?? null;
    if (marker) {
      if (openFence === null) openFence = marker;
      else if (marker[0] === openFence[0] && marker.length >= openFence.length) openFence = null;
    }
    const quarter = openFence === null ? headingQuarter(line) : null;
    if (quarter) {
      flush();
      current = { heading: line.replace(/\r?\n$/, ''), quarter, text: line };
    } else if (current) {
      current.text += line;
    } else {
      preamble += line;
    }
  }
  flush();
  return { preamble, sections };
}
