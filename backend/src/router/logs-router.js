import { Router } from "express";
import { sendServiceError } from "../middleware/service-error-response.js";
import { logService } from "../services/log-service.js";

export function createLogsRouter({ database, llmProvider, analysisLimits }) {
  const router = Router();
  const service = logService({ database, llmProvider, analysisLimits });

  router.get("/", async (req, res) => {
    try {
      const logs = await service.getLogs(req.query);
      return res.status(200).json(logs);
    } catch (error) {
      return sendServiceError(res, error);
    }
  });

  router.get("/summary", async (req, res) => {
    try {
      return res.json(await service.getSummary(req.query));
    } catch (error) {
      return sendServiceError(res, error);
    }
  });

  router.post("/", async (req, res) => {
    const { body } = req;

    try {
      const log = await service.saveLog(body);
      return res.status(201).json(log);
    } catch (error) {
      return sendServiceError(res, error);
    }
  });

  router.post("/analyze", async (req, res) => {
    const { body } = req;

    try {
      const analysis = await service.analyze(body);
      return res.status(202).json(analysis);
    } catch (error) {
      return sendServiceError(res, error);
    }
  });

  return router;
}
