type LogLevel = "INFO" | "WARN" | "ERROR";

function stamp(): string {
  return new Date().toISOString();
}

function format(service: string, level: LogLevel, message: string): string {
  return `[${service}] [${stamp()}] [${level}] ${message}`;
}

export function logInfo(service: string, message: string): void {
  console.log(format(service, "INFO", message));
}

export function logWarn(service: string, message: string): void {
  console.warn(format(service, "WARN", message));
}

export function logError(service: string, message: string, err?: unknown): void {
  if (err) {
    console.error(format(service, "ERROR", message), err);
    return;
  }
  console.error(format(service, "ERROR", message));
}
