import { inspect } from 'node:util';

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

// HTTP mode logs to stdout; configureLogger() switches to stderr for stdio mode
let output: NodeJS.WriteStream = process.stdout;

const pad = (value: number) => String(value).padStart(2, '0');

// Short date format: HH:mm:ss MM/DD/YY
function formatTimestamp(date: Date): string {
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  return `${time} ${pad(date.getMonth() + 1)}/${pad(date.getDate())}/${pad(date.getFullYear() % 100)}`;
}

function log(level: LogLevel, message: string, args: unknown[]): void {
  // Additional arguments (usually a caught error) are appended; errors are printed with their stack
  const parts = [message, ...args.map((arg) => (typeof arg === 'string' ? arg : inspect(arg)))];
  output.write(`[${formatTimestamp(new Date())}] ${level.toUpperCase()}: ${parts.join(' ')}\n`);
}

const logger = {
  error: (message: string, ...args: unknown[]) => log('error', message, args),
  warn: (message: string, ...args: unknown[]) => log('warn', message, args),
  info: (message: string, ...args: unknown[]) => log('info', message, args),
  debug: (message: string, ...args: unknown[]) => log('debug', message, args),
};

/**
 * Configure the logger for the specified transport mode
 */
export function configureLogger(transportMode: string): void {
  const isStdioMode = transportMode === 'stdio';

  // In stdio mode, ALL logs must go to stderr to avoid polluting stdout
  output = isStdioMode ? process.stderr : process.stdout;

  // Log the mode configuration
  if (isStdioMode) {
    logger.debug('Logger configured for stdio mode - all output to stderr');
  } else {
    logger.debug('Logger configured for HTTP mode - normal console output');
  }
}

export default logger;
