import { Router } from "express";
import { sendServiceError } from "../middleware/service-error-response.js";
import { categoryService } from "../services/category-service.js";

export function createCategoriesRouter({ database }) {
  const router = Router();
  const service = categoryService({ database });

  router.get("/", async (_req, res) => {
    try {
      return res.json({ items: await service.getCategories() });
    } catch (error) {
      return sendServiceError(res, error);
    }
  });

  return router;
}
