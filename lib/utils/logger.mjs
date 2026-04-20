function stamp() {
  return new Date().toISOString();
}

function format(service, level, message) {
  return `[${service}] [${stamp()}] [${level}] ${message}`;
}

export function logInfo(service, message) {
  console.log(format(service, "INFO", message));
}

export function logWarn(service, message) {
  console.warn(format(service, "WARN", message));
}

export function logError(service, message, err) {
  if (err) {
    console.error(format(service, "ERROR", message), err);
    return;
  }
  console.error(format(service, "ERROR", message));
}
