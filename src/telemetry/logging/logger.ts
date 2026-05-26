import pino, { type Logger, type LoggerOptions } from 'pino';

let rootLogger: Logger | null = null;

export function getLogger(options?: LoggerOptions): Logger {
  if (!rootLogger) {
    rootLogger = pino({
      level: process.env.MARIABOSS_LOG_LEVEL ?? 'info',
      ...options,
    });
  }
  return rootLogger;
}

export function childLogger(bindings: Record<string, unknown>): Logger {
  return getLogger().child(bindings);
}
