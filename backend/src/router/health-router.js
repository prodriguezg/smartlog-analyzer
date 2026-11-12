import { Router } from "express";

export function createHealthRouter({ database }) {
  const router = Router();

  router.get("/", async (_request, response) => {
    response.set("Cache-Control", "no-store");

    try {
      await database.authenticate();
    } catch (error) {
      console.error("Error occurred while authenticating database:", error);
      return response.status(503).send({
        status: "unavailable",
        checks: { database: "unavailable" },
      });
    }

    return response.send({ status: "ok", checks: { database: "ok" } });
  });

  return router;
}
