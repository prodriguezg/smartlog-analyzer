import { fileURLToPath } from "node:url";
import express from "express";
import swaggerUi from "swagger-ui-express";
import { createOpenApiValidationMiddleware } from "./middleware/openapi-validation-middleware.js";
import { handleHttpError, sendHttpError } from "./middleware/service-error-response.js";
import { createHealthRouter } from "./router/health-router.js";
import { createLogsRouter } from "./router/logs-router.js";
import { createAnalysisRouter } from "./router/analysis-router.js";
import { createCategoriesRouter } from "./router/categories-router.js";

const specPath = fileURLToPath(new URL("../openapi.yaml", import.meta.url));

const paths = {
  analysis: "/api/analysis",
  categories: "/api/categories",
  docs: "/api/docs",
  health: "/api/health",
  logs: "/api/logs",
  spec: "/api/openapi.yaml",
};

export function createApp({ database, llmProvider, analysisLimits }) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ strict: false }));
  app.use(createOpenApiValidationMiddleware(specPath));

  app.get(paths.spec, (_request, response) => {
    response.type("application/yaml").sendFile(specPath);
  });

  app.use(
    paths.docs,
    swaggerUi.serve,
    swaggerUi.setup(null, {
      customSiteTitle: "SmartLog Analyzer API",
      swaggerOptions: { url: paths.spec },
    }),
  );

  app.use(paths.health, createHealthRouter({ database, llmProvider }));
  app.use(paths.logs, createLogsRouter({ database, llmProvider, analysisLimits }));
  app.use(paths.analysis, createAnalysisRouter({ database }));
  app.use(paths.categories, createCategoriesRouter({ database }));

  app.use("/api", (_request, response) => {
    return sendHttpError(response, 404, "ROUTE_NOT_FOUND", "La ruta solicitada no existe.");
  });
  app.use(handleHttpError);

  return app;
}
