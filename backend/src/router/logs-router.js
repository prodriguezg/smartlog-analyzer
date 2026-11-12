import { Router } from "express";

export function createLogsRouter({ database, path }) {
  const router = Router();

  router.get("/", async (req, res) => {
    return res.send({ op: "logs" });
  });

  router.get("/summary", async (req, res) => {
    try {
      return res.status(200).send({ op: "log summary" });
    } catch (error) {
      console.error("Error retrieving log summary:", error);
      return res.status(500).send({ error: "Failed to retrieve log summary" });
    }
  });

  router.post("/", async (req, res) => {
    const { body } = req;

    try {
      await database.insertLog(body);
      return res.status(201).send({ message: "Log inserted successfully" });
    } catch (error) {
      console.error("Error inserting log:", error);
      return res.status(500).send({ error: "Failed to insert log" });
    }
  });

  router.post("/analyze", async (req, res) => {
    const { body } = req;

    try {
      const analysisResult = await database.analyzeLog(body);
      return res.status(200).send(analysisResult);
    } catch (error) {
      console.error("Error analyzing log:", error);
      return res.status(500).send({ error: "Failed to analyze log" });
    }
  });

  return router;
}
