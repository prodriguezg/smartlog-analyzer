import { Router } from "express";

async function checkDatabase(database) {
  try {
    await database.authenticate();
    return "ok";
  } catch (error) {
    console.error("Error occurred while authenticating database:", error);
    return "unavailable";
  }
}

async function checkProvider(llmProvider) {
  try {
    return await llmProvider.checkHealth();
  } catch {
    return { status: "unavailable", reason: "No se pudo comprobar el proveedor de análisis." };
  }
}

export function createHealthRouter({ database, llmProvider }) {
  const router = Router();

  router.get("/", async (_request, response) => {
    response.set("Cache-Control", "no-store");

    const [databaseStatus, provider] = await Promise.all([
      checkDatabase(database),
      checkProvider(llmProvider),
    ]);
    const checks = { database: databaseStatus, provider };

    if (databaseStatus === "unavailable") {
      return response.status(503).json({ status: "unavailable", checks });
    }

    const status = provider.status === "ok" ? "ok" : "degraded";
    return response.json({ status, checks });
  });

  return router;
}
