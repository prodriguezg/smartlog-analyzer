import { fileURLToPath } from 'node:url';
import express from 'express';
import swaggerUi from 'swagger-ui-express';

const specPath = fileURLToPath(new URL('../openapi.yaml', import.meta.url));

export function createApp({ database }) {
  const app = express();
  app.disable('x-powered-by');

  app.get('/api/health', async (_request, response) => {
    response.set('Cache-Control', 'no-store');

    try {
      await database.authenticate();
    } catch {
      return response.status(503).json({
        status: 'unavailable',
        checks: { database: 'unavailable' },
      });
    }

    return response.json({ status: 'ok', checks: { database: 'ok' } });
  });

  app.get('/api/openapi.yaml', (_request, response) => {
    response.type('application/yaml').sendFile(specPath);
  });

  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(null, {
    customSiteTitle: 'SmartLog Analyzer API',
    swaggerOptions: { url: '/api/openapi.yaml' },
  }));

  return app;
}
