import { DataTypes } from "sequelize";

const id = { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true };
const foreignId = { type: DataTypes.INTEGER.UNSIGNED, allowNull: false };
const createdAt = { type: DataTypes.DATE(3), allowNull: false, defaultValue: DataTypes.NOW };
const logText = { type: DataTypes.TEXT("medium"), allowNull: false };
const requiredText = { type: DataTypes.TEXT, allowNull: false };
const categoryCode = DataTypes.STRING(64);

export function defineModels(database) {
  const options = { timestamps: false, underscored: true };

  const Log = database.define("Log", {
    id: { ...id },
    timestamp: { type: DataTypes.DATE(3), allowNull: false, field: "event_at" },
    service: { ...logText },
    level: { ...logText },
    message: { ...logText },
    traceId: DataTypes.TEXT("medium"),
  }, { ...options, tableName: "logs" });

  const Analysis = database.define("Analysis", {
    id: { ...id },
    status: {
      type: DataTypes.ENUM("PENDING", "COMPLETED", "FAILED"),
      allowNull: false,
      defaultValue: "PENDING",
    },
    provider: DataTypes.STRING(64),
    createdAt: { ...createdAt },
    finishedAt: DataTypes.DATE(3),
    summary: DataTypes.TEXT,
    errorCode: DataTypes.STRING(64),
    errorMessage: DataTypes.TEXT,
  }, { ...options, tableName: "analyses" });

  const Category = database.define("Category", {
    code: { type: categoryCode, primaryKey: true },
    description: { ...requiredText },
  }, { ...options, tableName: "categories" });

  const Finding = database.define("Finding", {
    id: { ...id },
    analysisId: { ...foreignId },
    categoryCode: { type: categoryCode, allowNull: false },
    createdAt: { ...createdAt },
    description: { ...requiredText },
    suggestion: { ...requiredText },
  }, { ...options, tableName: "findings" });

  const AnalysisLog = database.define("AnalysisLog", {
    analysisId: { ...foreignId, primaryKey: true, onDelete: "CASCADE" },
    logId: { ...foreignId, primaryKey: true, onDelete: "RESTRICT" },
  }, { ...options, tableName: "analysis_logs" });

  const FindingLog = database.define("FindingLog", {
    findingId: { ...foreignId, primaryKey: true, onDelete: "CASCADE" },
    logId: { ...foreignId, primaryKey: true, onDelete: "RESTRICT" },
  }, { ...options, tableName: "finding_logs" });

  const findingAnalysis = { foreignKey: "analysisId", onDelete: "CASCADE" };
  Analysis.hasMany(Finding, { ...findingAnalysis, as: "findings" });
  Finding.belongsTo(Analysis, { ...findingAnalysis, as: "analysis" });

  const findingCategory = { foreignKey: "categoryCode", onDelete: "RESTRICT" };
  Category.hasMany(Finding, { ...findingCategory, as: "findings" });
  Finding.belongsTo(Category, { ...findingCategory, as: "category" });

  const analysisLogs = { model: AnalysisLog, unique: false };
  Analysis.belongsToMany(Log, {
    as: "logs", through: analysisLogs, foreignKey: "analysisId", otherKey: "logId",
  });
  Log.belongsToMany(Analysis, {
    as: "analyses", through: analysisLogs, foreignKey: "logId", otherKey: "analysisId",
  });

  const findingLogs = { model: FindingLog, unique: false };
  Finding.belongsToMany(Log, {
    as: "evidence", through: findingLogs, foreignKey: "findingId", otherKey: "logId",
  });
  Log.belongsToMany(Finding, {
    as: "findings", through: findingLogs, foreignKey: "logId", otherKey: "findingId",
  });
}
