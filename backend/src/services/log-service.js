import { Op, QueryTypes } from "sequelize";
import { defaultAnalysisLimits } from "../analysis-limits.js";

export const logOrder = [["timestamp", "DESC"], ["id", "DESC"]];

class LogRequestError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function logFilters({ service, level, traceId, from, to }) {
  const start = from === undefined ? undefined : new Date(from);
  const end = to === undefined ? undefined : new Date(to);

  if (start && end && start >= end) {
    throw new LogRequestError(400, "INVALID_REQUEST", "La fecha from debe ser anterior a to.");
  }

  const where = {};
  if (service !== undefined) where.service = service;
  if (level !== undefined) where.level = level;
  if (traceId !== undefined) where.traceId = traceId;
  if (start || end) {
    where.timestamp = {};
    if (start) where.timestamp[Op.gte] = start;
    if (end) where.timestamp[Op.lt] = end;
  }
  return where;
}

export function formatLog({ traceId, ...log }) {
  return traceId == null ? log : { ...log, traceId };
}

export function logService({ database, llmProvider, analysisLimits = defaultAnalysisLimits }) {
  const { maxLogs, maxKiB } = analysisLimits;
  const tooManyLogs = `La selección supera el límite de ${maxLogs} logs. Acota el rango de fechas o selecciona menos IDs.`;

  return {
    async saveLog({ timestamp, service, level, message, traceId }) {
      try {
        const { id } = await database.models.Log.create({
          timestamp,
          service,
          level,
          message,
          traceId,
        });
        return { id };
      } catch (error) {
        console.error("Error saving log:", error);
        throw new Error("Failed to save log", { cause: error });
      }
    },

    async getLogs({ limit = 50, offset = 0, ...filters } = {}) {
      const where = logFilters(filters);

      try {
        const logs = await database.models.Log.findAll({
          where,
          order: logOrder,
          limit: limit + 1,
          offset,
          raw: true,
        });
        return {
          items: logs.slice(0, limit).map(formatLog),
          limit,
          offset,
          hasMore: logs.length > limit,
        };
      } catch (error) {
        console.error("Error retrieving logs:", error);
        throw new Error("Failed to retrieve logs", { cause: error });
      }
    },

    async getSummary(filters = {}) {
      const where = logFilters(filters);
      const conditions = [];
      const bind = {};

      for (const [attribute, column] of [["service", "service"], ["level", "level"], ["traceId", "trace_id"]]) {
        if (where[attribute] !== undefined) {
          conditions.push(`${column} = $${attribute}`);
          bind[attribute] = where[attribute];
        }
      }
      if (where.timestamp?.[Op.gte]) {
        conditions.push("event_at >= $from");
        bind.from = where.timestamp[Op.gte];
      }
      if (where.timestamp?.[Op.lt]) {
        conditions.push("event_at < $to");
        bind.to = where.timestamp[Op.lt];
      }

      try {
        const items = await database.query(`
          SELECT service, level, COUNT(id) AS count
          FROM logs
          ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
          GROUP BY service, level
          ORDER BY service ASC, level ASC
        `, { bind, type: QueryTypes.SELECT });
        return { items: items.map(({ service, level, count }) => ({ service, level, count: Number(count) })) };
      } catch (error) {
        console.error("Error retrieving log summary:", error);
        throw new Error("Failed to retrieve log summary", { cause: error });
      }
    },

    async analyze({ filters, logIds }) {
      if ((filters === undefined) === (logIds === undefined)) {
        throw new LogRequestError(400, "INVALID_REQUEST", "Indica filtros o IDs de logs.");
      }

      const ids = logIds === undefined ? undefined : [...new Set(logIds)];
      const where = ids ? { id: { [Op.in]: ids } } : logFilters(filters);
      if (llmProvider?.configurationIssue) {
        throw new LogRequestError(503, "PROVIDER_UNAVAILABLE", llmProvider.configurationIssue);
      }
      if (ids?.length > maxLogs) {
        throw new LogRequestError(422, "SELECTION_TOO_LARGE", tooManyLogs);
      }
      if (ids?.length === 0) {
        throw new LogRequestError(422, "EMPTY_SELECTION", "La selección está vacía. Ajusta los filtros o indica IDs de logs.");
      }

      try {
        return await database.transaction(async (transaction) => {
          const { Log, Analysis, AnalysisLog } = database.models;
          const logs = await Log.findAll({
            where,
            order: logOrder,
            limit: maxLogs + 1,
            raw: true,
            transaction,
          });

          if (logs.length > maxLogs) {
            throw new LogRequestError(422, "SELECTION_TOO_LARGE", tooManyLogs);
          }
          if (ids && logs.length !== ids.length) {
            throw new LogRequestError(422, "LOG_IDS_NOT_FOUND", "Uno o más IDs de la selección no existen.");
          }
          if (logs.length === 0) {
            throw new LogRequestError(422, "EMPTY_SELECTION", "La selección está vacía. Ajusta los filtros o indica IDs de logs.");
          }
          const selectionBytes = Buffer.byteLength(JSON.stringify(logs.map(formatLog)));
          if (selectionBytes > maxKiB * 1024) {
            throw new LogRequestError(
              422,
              "SELECTION_TOO_LARGE",
              `La selección supera el límite de ${maxKiB} KiB. Acota el rango de fechas o selecciona menos IDs.`,
            );
          }

          const { id, status } = await Analysis.create({ status: "PENDING" }, { transaction });
          await AnalysisLog.bulkCreate(
            logs.map((log) => ({ analysisId: id, logId: log.id })),
            { transaction },
          );
          return { id, status };
        });
      } catch (error) {
        if (error instanceof LogRequestError) throw error;
        console.error("Error requesting log analysis:", error);
        throw new Error("Failed to request log analysis", { cause: error });
      }
    },
  };
}
