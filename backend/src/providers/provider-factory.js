import { createMockProvider } from "./mock-llm.js";
import { createOpenAIProvider } from "./openai.js";

export function createProvider({
  env = process.env,
  fetch = globalThis.fetch,
} = {}) {
  const name = env.LLM_PROVIDER?.trim() || "mock";

  switch (name) {
    case "mock":
      return createMockProvider();
    case "openai":
      return createOpenAIProvider({
        apiKey: env.OPENAI_API_KEY?.trim(),
        model: env.OPENAI_MODEL?.trim(),
        fetch,
      });
    default:
      throw new Error(
        'LLM_PROVIDER no soportado. Soportados: ["mock", "openai"].',
      );
  }
}
