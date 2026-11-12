const timeoutPattern = /\b(?:timeout|timed out|ETIMEDOUT|tiempo de espera|no respondi[oó] a tiempo)\b/i;

export function createMockProvider() {
  return {
    async analyze({ logs, categories }) {
      const timeouts = logs.filter((log) => timeoutPattern.test(log.message));
      const findings = [];

      if (timeouts.length > 0 && categories.some(({ code }) => code === "timeout")) {
        findings.push({
          category: "timeout",
          description: `${timeouts.length} logs indican que se agotó el tiempo de espera.`,
          suggestion: "Revisar la latencia y los límites de tiempo de los servicios afectados.",
          evidenceLogIds: timeouts.map(({ id }) => id),
        });
      }

      return {
        summary: `Se analizaron ${logs.length} logs. ${timeouts.length} indican un timeout.`,
        findings,
      };
    },

    async checkHealth() {
      return { status: "ok" };
    },
  };
}
