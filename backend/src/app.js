import { fileURLToPath } from "node:url";
import express from "express";
import swaggerUi from "swagger-ui-express";
import { createOpenApiValidationMiddleware } from "./middleware/openapi-validation-middleware.js";
import { createHealthRouter } from "./router/health-router.js";
import { createLogsRouter } from "./router/logs-router.js";
import { createAnalysisRouter } from "./router/analysis-router.js";

const specPath = fileURLToPath(new URL("../openapi.yaml", import.meta.url));

const paths = {
  analysis: "/api/analysis",
  docs: "/api/docs",
  health: "/api/health",
  logs: "/api/logs",
  spec: "/api/openapi.yaml",
};

export function createApp({ database }) {
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

  app.use(paths.health, createHealthRouter({ database }));
  app.use(paths.logs, createLogsRouter({ database, path: paths.logs }));
  app.use(paths.analysis, createAnalysisRouter({ database }));

  return app;
}
