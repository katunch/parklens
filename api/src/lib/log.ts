function ts(): string {
  return new Date().toISOString();
}

function fmtErr(err: unknown): string {
  if (err instanceof Error) return err.stack ?? err.message;
  return String(err);
}

/** Minimal stdout/stderr logger: one line per message. */
export const log = {
  info(msg: string): void {
    process.stdout.write(`${ts()} INFO  ${msg}\n`);
  },
  warn(msg: string): void {
    process.stdout.write(`${ts()} WARN  ${msg}\n`);
  },
  error(msg: string, err?: unknown): void {
    process.stderr.write(`${ts()} ERROR ${msg}${err === undefined ? '' : `: ${fmtErr(err)}`}\n`);
  },
};
