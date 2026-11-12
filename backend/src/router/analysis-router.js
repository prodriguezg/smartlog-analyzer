import { Router } from "express";

export function createAnalysisRouter({ database, llmProvider }) {
  const router = Router();

  router.get("/findings", async (req, res) => {
    try {
      return res.status(200).send({ op: "findings" });
    } catch (error) {
      console.error("Error retrieving findings:", error);
      return res.status(500).send({ error: "Failed to retrieve findings" });
    }
  });

  router.get("/:id", async (req, res) => {
    const { id } = req.params;

    try {
      return res.status(200).send({ op: "analysis", id: id });
    } catch (error) {
      console.error("Error retrieving analysis:", error);
      return res.status(500).send({ error: "Failed to retrieve analysis" });
    }
  });

  return router;
}
