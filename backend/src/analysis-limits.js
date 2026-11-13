export const defaultAnalysisLimits = { maxLogs: 100, maxKiB: 32 };

function readLimit(env, name, fallback, isWithinRange) {
  const raw = env[name] ?? String(fallback);
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || value < 1 || !isWithinRange(value)) {
    throw new Error(`${name} debe ser un entero positivo dentro del rango admitido.`);
  }
  return value;
}

export function readAnalysisLimits(env = process.env) {
  return {
    maxLogs: readLimit(env, "ANALYSIS_MAX_LOGS", defaultAnalysisLimits.maxLogs,
      (value) => Number.isSafeInteger(value + 1)),
    maxKiB: readLimit(env, "ANALYSIS_MAX_KIB", defaultAnalysisLimits.maxKiB,
      (value) => Number.isSafeInteger(value * 1024)),
  };
}
