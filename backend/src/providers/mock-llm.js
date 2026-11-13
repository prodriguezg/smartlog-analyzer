const findingRules = [
  {
    category: "timeout",
    pattern: /\b(?:timeout|timed out|ETIMEDOUT|tiempo de espera|no respondi[oó] a tiempo)\b/i,
    description: "Hay evidencia de operaciones que excedieron el tiempo de espera.",
    suggestion: "Revisar la latencia y los límites de tiempo de los servicios afectados.",
  },
  {
    category: "dependency_failure",
    pattern: /\b(?:provider|upstream|dependency) (?:is )?unavailable\b/i,
    description: "Hay evidencia de una dependencia que estuvo indisponible.",
    suggestion: "Revisar la disponibilidad de la dependencia y el resultado de los reintentos.",
  },
  {
    category: "resource_exhaustion",
    pattern: /\b(?:insufficient stock|out[ _]of[ _]stock)\b/i,
    description: "Hay evidencia de que el stock disponible era insuficiente para completar una compra.",
    suggestion: "Revisar la disponibilidad del SKU y sincronizar el stock con el servicio de checkout.",
  },
];

export function createMockProvider() {
  return {
    name: "mock",

    async analyze({ logs, categories }) {
      const categoryCodes = new Set(categories.map(({ code }) => code));
      const findings = [];

      for (const { category, pattern, description, suggestion } of findingRules) {
        if (!categoryCodes.has(category)) continue;

        const evidenceLogIds = logs.filter(({ message }) => pattern.test(message))
          .map(({ id }) => id)
          .sort((a, b) => a - b);
        if (evidenceLogIds.length > 0) {
          findings.push({ category, description, suggestion, evidenceLogIds });
        }
      }

      const findingCount = findings.length === 1 ? "1 hallazgo" : `${findings.length} hallazgos`;
      return {
        summary: `El análisis de ${logs.length} registros generó ${findingCount}.`,
        findings,
      };
    },

    async checkHealth() {
      return { status: "ok" };
    },
  };
}
