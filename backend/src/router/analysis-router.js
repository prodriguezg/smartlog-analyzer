import { Router } from "express";
import { sendServiceError } from "../middleware/service-error-response.js";
import { analysisService } from "../services/analysis-service.js";

export function createAnalysisRouter({ database }) {
  const router = Router();
  const service = analysisService({ database });

  router.get("/", async (req, res) => {
    try {
      return res.json(await service.getAnalyses(req.query));
    } catch (error) {
      return sendServiceError(res, error);
    }
  });

  router.get("/findings", async (req, res) => {
    try {
      return res.json(await service.getFindings(req.query));
    } catch (error) {
      return sendServiceError(res, error);
    }
  });

  router.get("/:id", async (req, res) => {
    const { id } = req.params;

    try {
      const analysis = await service.getAnalysis(id);
      if (!analysis) {
        return res.status(404).json({
          error: { code: "ANALYSIS_NOT_FOUND", message: "El análisis solicitado no existe." },
        });
      }
      return res.json(analysis);
    } catch (error) {
      return sendServiceError(res, error);
    }
  });

  return router;
}
