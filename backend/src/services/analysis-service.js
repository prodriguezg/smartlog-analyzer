import { col } from "sequelize";
import { formatLog, logFilters, logOrder } from "./log-service.js";

const findingOrder = [["createdAt", "DESC"], ["id", "DESC"]];
const evidenceInclude = { association: "evidence", through: { attributes: [] } };
const providerErrors = new Map([
  ["PROVIDER_TIMEOUT", "El proveedor de análisis no respondió a tiempo."],
  ["PROVIDER_UNAVAILABLE", "El proveedor de análisis no está disponible."],
  ["INVALID_PROVIDER_RESPONSE", "El proveedor de análisis devolvió un informe inválido."],
  ["PROVIDER_ERROR", "No se pudo completar la solicitud al proveedor de análisis."],
]);

function formatFinding(finding) {
  const { id, analysisId, categoryCode, createdAt, description, suggestion, evidence } =
    finding.get({ plain: true });
  return {
    id, analysisId, category: categoryCode, createdAt, description, suggestion,
    evidence: evidence.sort((a, b) => a.id - b.id).map(formatLog),
  };
}

function validateReport(report, categories, logs) {
  const categoryCodes = new Set(categories.map(({ code }) => code));
  const logIds = new Set(logs.map(({ id }) => id));
  const valid = typeof report?.summary === "string"
    && Array.isArray(report.findings)
    && Array.from(report.findings).every((finding) =>
      categoryCodes.has(finding?.category)
      && typeof finding.description === "string"
      && typeof finding.suggestion === "string"
      && Array.isArray(finding.evidenceLogIds)
      && finding.evidenceLogIds.length > 0
      && Array.from(finding.evidenceLogIds).every((id) => logIds.has(id)),
    );

  if (!valid) {
    const code = "INVALID_PROVIDER_RESPONSE";
    throw Object.assign(new Error(providerErrors.get(code)), { code });
  }
}

export function analysisService({ database, llmProvider }) {
  let processing;

  async function failAnalysis(id, errorCode, errorMessage) {
    await database.models.Analysis.update(
      { status: "FAILED", finishedAt: new Date(), errorCode, errorMessage },
      { where: { id, status: "PENDING" } },
    );
  }

  async function processPendingAnalysis() {
    const { Analysis, Category, Finding, FindingLog } = database.models;
    const analysis = await Analysis.findOne({
      where: { status: "PENDING" },
      order: [["id", "ASC"]],
    });
    if (!analysis) return false;

    const [selectedLogs, categories] = await Promise.all([
      analysis.getLogs({ order: logOrder, joinTableAttributes: [] }),
      Category.findAll({ order: [["code", "ASC"]], raw: true }),
    ]);
    const logs = selectedLogs.map((log) => formatLog(log.get({ plain: true })));
    if (logs.length === 0) {
      await failAnalysis(analysis.id, "EMPTY_SELECTION", "El análisis no tiene logs asociados.");
      return true;
    }

    let report;
    try {
      report = await llmProvider.analyze({ logs, categories });
      validateReport(report, categories, logs);
    } catch (error) {
      const code = providerErrors.has(error?.code) ? error.code : "PROVIDER_ERROR";
      await failAnalysis(analysis.id, code, providerErrors.get(code));
      return true;
    }

    try {
      await database.transaction(async (transaction) => {
        const finishedAt = new Date();
        const [updated] = await Analysis.update(
          { status: "COMPLETED", summary: report.summary, finishedAt },
          { where: { id: analysis.id, status: "PENDING" }, transaction },
        );
        if (!updated) return;

        for (const { category, description, suggestion, evidenceLogIds } of report.findings) {
          const finding = await Finding.create({
            analysisId: analysis.id, categoryCode: category, description, suggestion, createdAt: finishedAt,
          }, { transaction });
          await FindingLog.bulkCreate(
            [...new Set(evidenceLogIds)].map((logId) => ({ findingId: finding.id, logId })),
            { transaction },
          );
        }
      });
    } catch (error) {
      console.error("Error saving analysis report:", error);
      await failAnalysis(analysis.id, "ANALYSIS_ERROR", "No se pudo guardar el resultado del análisis.");
    }
    return true;
  }

  return {
    processNextAnalysis() {
      processing ??= processPendingAnalysis().finally(() => {
        processing = undefined;
      });
      return processing;
    },

    async failInterruptedAnalyses() {
      await database.models.Analysis.update({
        status: "FAILED",
        finishedAt: new Date(),
        errorCode: "ANALYSIS_INTERRUPTED",
        errorMessage: "El servicio se reinició antes de completar el análisis.",
      }, { where: { status: "PENDING" } });
    },

    async getAnalysis(id) {
      try {
        const analysis = await database.models.Analysis.findByPk(id, {
          include: [{ association: "logs", attributes: ["id"], through: { attributes: [] } }],
        });
        if (!analysis) return null;

        const { status, createdAt, finishedAt, logs, summary, errorCode, errorMessage } = analysis;
        const logIds = logs.map(({ id }) => id).sort((a, b) => a - b);
        const result = { id: analysis.id, status, createdAt, logIds };
        if (status === "COMPLETED") {
          const findings = await analysis.getFindings({ include: [evidenceInclude], order: findingOrder });
          return { ...result, finishedAt, report: { summary, findings: findings.map(formatFinding) } };
        }
        if (status === "FAILED") {
          return { ...result, finishedAt, error: { code: errorCode, message: errorMessage } };
        }
        return result;
      } catch (error) {
        console.error("Error retrieving analysis:", error);
        throw new Error("Failed to retrieve analysis", { cause: error });
      }
    },

    async getFindings({ category, limit = 50, offset = 0, ...filters } = {}) {
      const logWhere = logFilters(filters);
      const where = category === undefined ? {} : { categoryCode: category };
      const matchingEvidence = Object.keys(logWhere).length === 0 ? [] : [{
        ...evidenceInclude, attributes: [], required: true, where: logWhere,
      }];

      try {
        const { Finding } = database.models;
        return await database.transaction(async (transaction) => {
          // Page by finding ID first so matching evidence rows cannot split a finding across pages.
          const matches = await Finding.findAll({
            attributes: ["id"],
            where,
            include: matchingEvidence,
            group: [col("Finding.id"), col("Finding.created_at")],
            subQuery: false,
            raw: true,
            order: findingOrder,
            limit: limit + 1,
            offset,
            transaction,
          });
          const ids = matches.slice(0, limit).map(({ id }) => id);
          const findings = ids.length === 0 ? [] : await Finding.findAll({
            where: { id: ids },
            include: [evidenceInclude],
            order: findingOrder,
            transaction,
          });
          return { items: findings.map(formatFinding), limit, offset, hasMore: matches.length > limit };
        });
      } catch (error) {
        console.error("Error retrieving findings:", error);
        throw new Error("Failed to retrieve findings", { cause: error });
      }
    },
  };
}
