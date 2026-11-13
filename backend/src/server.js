import { setTimeout as delay } from "node:timers/promises";
import { AccessDeniedError, ConnectionError } from "sequelize";
import { createApp } from "./app.js";
import { readAnalysisLimits } from "./analysis-limits.js";
import { createSequelize } from "./repositories/sequelize/index.js";
import { createProvider } from "./providers/provider-factory.js";
import { runMigrations } from "./repositories/sequelize/migrations/index.js";
import { analysisService } from "./services/analysis-service.js";
import { startAnalysisWorker } from "./workers/analysis-worker.js";

const port = Number(process.env.PORT ?? 3000);
const analysisLimits = readAnalysisLimits();
const llmProvider = createProvider();
const database = createSequelize({
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT ?? 3306),
  name: process.env.DB_NAME ?? "smartlog",
  user: process.env.DB_USER ?? "smartlog",
  password: process.env.DB_PASSWORD ?? "smartlog-dev",
});
const analysis = analysisService({ database, llmProvider });

async function waitForDatabase() {
  const deadline = Date.now() + 30_000;
  for (;;) {
    try {
      await database.authenticate();
      return;
    } catch (error) {
      if (!(error instanceof ConnectionError) || error instanceof AccessDeniedError || Date.now() >= deadline) {
        throw error;
      }
      // A joint Compose restart can start Express before MySQL is ready again.
      await delay(1_000);
    }
  }
}

try {
  await waitForDatabase();
  await runMigrations(database);
  await analysis.failInterruptedAnalyses();
} catch (error) {
  await database.close();
  throw error;
}

let stopAnalysisWorker;

const server = createApp({ database, llmProvider, analysisLimits }).listen(port, "0.0.0.0");
server.once("listening", () => {
  stopAnalysisWorker = startAnalysisWorker(analysis);
  console.log(`SmartLog Analyzer API listening on port ${port}`);
});

async function closeDatabase() {
  try {
    await stopAnalysisWorker?.();
    await database.close();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}

process.once("SIGINT", () => server.close(closeDatabase));
process.once("SIGTERM", () => server.close(closeDatabase));
