/** Small error helpers shared by the devlog writer and the devlog-size finding (slice 936). */

export function errorCode(error: unknown): string | undefined {
  return error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined;
}

export function causeText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
