import * as OpenApiValidator from "express-openapi-validator";
import { sendHttpError } from "./service-error-response.js";

function handleValidationError(error, _request, response, next) {
  const malformedJson = error.type === "entity.parse.failed";
  const { BadRequest, UnsupportedMediaType } = OpenApiValidator.error;

  if (!malformedJson && !(error instanceof BadRequest) && !(error instanceof UnsupportedMediaType)) {
    return next(error);
  }

  return sendHttpError(response, 400, "INVALID_REQUEST",
    malformedJson ? "El cuerpo debe ser JSON válido." : error.message);
}

export function createOpenApiValidationMiddleware(apiSpec, { validateResponses = false } = {}) {
  return [
    ...OpenApiValidator.middleware({
      apiSpec,
      ignoreUndocumented: true,
      validateRequests: true,
      validateResponses,
      validateSecurity: false,
      fileUploader: false,
    }),
    handleValidationError,
  ];
}
