import { createApp } from "./app.js";
import { createSequelize } from "./repositories/sequelize.js";
import { createProvider } from "./providers/provider-factory.js";

const port = Number(process.env.PORT ?? 3000);
const database = createSequelize({
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT ?? 3306),
  name: process.env.DB_NAME ?? "smartlog",
  user: process.env.DB_USER ?? "smartlog",
  password: process.env.DB_PASSWORD ?? "smartlog-dev",
});

const llmProvider = createProvider();

const server = createApp({ database, llmProvider }).listen(
  port,
  "0.0.0.0",
  () => {
    console.log(`SmartLog Analyzer API listening on port ${port}`);
  },
);

async function closeDatabase() {
  try {
    await database.close();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}

process.once("SIGINT", () => server.close(closeDatabase));
process.once("SIGTERM", () => server.close(closeDatabase));
