/** Pure archive planning: decide which sections stay in DEVLOG.md (slice 936, D4/D5/D6). */
import { quarterKey, type ParsedDevlog } from './devlogSections.js';

export const NO_MOVE_REASON = {
  /** D3: the file has no dated headings. */
  NoDatedHeadings: 'no-dated-headings',
  /** D5: the newest section is kept whole and is the only section. */
  NewestExceedsTarget: 'newest-exceeds-target',
  /** Everything already fits in the target. */
  WithinTarget: 'within-target',
} as const;

export type NoMoveReason = (typeof NO_MOVE_REASON)[keyof typeof NO_MOVE_REASON];

/** User-facing text for each no-move case (CLI output and the devlog-size finding). */
export const NO_MOVE_REASON_TEXT: Record<NoMoveReason, string> = {
  [NO_MOVE_REASON.NoDatedHeadings]:
    'DEVLOG.md has no dated `##` headings (## YYYYMMDD), so there is nothing to archive; add dated headings to enable archiving.',
  [NO_MOVE_REASON.NewestExceedsTarget]:
    'The newest day section alone exceeds the limit and sections are never split; edit it by hand.',
  [NO_MOVE_REASON.WithinTarget]: 'Every section already fits within the target size.',
};

export interface ArchivePlan {
  /** New DEVLOG.md text: preamble plus the kept sections. */
  keptText: string;
  /** Moved section texts by `YYYY-Qn`, in their original relative order. */
  movedByQuarter: Map<string, string[]>;
  movedCount: number;
  /** Set only when nothing moves. */
  reason: NoMoveReason | null;
}

const BLANK_LINE_END = /\n\r?\n$/;

function byteLength(text: string): number {
  return Buffer.byteLength(text, 'utf8');
}

/** D6: end a moved section in a blank line so it cannot join the next heading. */
function endWithBlankLine(text: string): string {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  let out = text.endsWith('\n') ? text : text + eol;
  if (!BLANK_LINE_END.test(out)) out += eol;
  return out;
}

export function planDevlogArchive(parsed: ParsedDevlog, targetBytes: number): ArchivePlan {
  const { preamble, sections } = parsed;
  const movedByQuarter = new Map<string, string[]>();
  if (sections.length === 0) {
    return {
      keptText: preamble,
      movedByQuarter,
      movedCount: 0,
      reason: NO_MOVE_REASON.NoDatedHeadings,
    };
  }

  // The newest (first) section is always kept (D5); the cut is positional (D4).
  let keptBytes = byteLength(preamble) + byteLength(sections[0].text);
  let cut = 1;
  while (cut < sections.length && keptBytes + byteLength(sections[cut].text) <= targetBytes) {
    keptBytes += byteLength(sections[cut].text);
    cut += 1;
  }

  const moved = sections.slice(cut);
  for (const section of moved) {
    const key = quarterKey(section);
    const bucket = movedByQuarter.get(key) ?? [];
    bucket.push(endWithBlankLine(section.text));
    movedByQuarter.set(key, bucket);
  }

  const keptText =
    preamble +
    sections
      .slice(0, cut)
      .map((s) => s.text)
      .join('');
  if (moved.length > 0) return { keptText, movedByQuarter, movedCount: moved.length, reason: null };
  const reason = keptBytes > targetBytes ? NO_MOVE_REASON.NewestExceedsTarget : NO_MOVE_REASON.WithinTarget;
  return { keptText, movedByQuarter, movedCount: 0, reason };
}
