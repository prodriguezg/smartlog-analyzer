import { ConnectionError } from "sequelize";

export function sendHttpError(response, status, code, message) {
  return response.status(status).json({ error: { code, message } });
}

export function sendServiceError(response, error) {
  if (error.status) {
    return sendHttpError(response, error.status, error.code, error.message);
  }
  if (error.cause instanceof ConnectionError) {
    return sendHttpError(response, 503, "DATABASE_UNAVAILABLE", "MySQL no está disponible.");
  }
  return sendHttpError(response, 500, "INTERNAL_ERROR", error.message);
}

export function handleHttpError(error, _request, response, next) {
  if (response.headersSent) return next(error);

  const status = error.status ?? error.statusCode;
  if (status === 413) {
    return sendHttpError(response, 413, "PAYLOAD_TOO_LARGE", "El cuerpo de la solicitud supera el límite permitido.");
  }
  if (status === 404) {
    return sendHttpError(response, 404, "ROUTE_NOT_FOUND", "La ruta solicitada no existe.");
  }
  if (status >= 400 && status < 500) {
    return sendHttpError(response, status, "INVALID_REQUEST", "La solicitud no se pudo procesar.");
  }

  console.error("Unhandled HTTP error:", error);
  return sendHttpError(response, 500, "INTERNAL_ERROR", "No se pudo completar la solicitud.");
}
