/* eslint-disable no-console */
function timestamp(): string {
  return new Date().toISOString();
}

export const logger = {
  info(message: string): void {
    console.log(`[${timestamp()}] INFO  ${message}`);
  },
  warn(message: string): void {
    console.warn(`[${timestamp()}] WARN  ${message}`);
  },
  error(message: string, err?: unknown): void {
    console.error(`[${timestamp()}] ERROR ${message}`, err ?? "");
  },
};
