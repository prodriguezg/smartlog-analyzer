import { Router } from "express";
import { categoryService } from "../services/category-service.js";

export function createCategoriesRouter({ database }) {
  const router = Router();

  router.get("/", async (req, res) => {
    try {
      const categories = await categoryService({ database }).getCategories();
      return res.status(200).send({ op: "categories", data: categories });
    } catch (error) {
      console.error("Error retrieving categories:", error);
      return res.status(500).send({ error: "Failed to retrieve categories" });
    }
  });

  return router;
}
