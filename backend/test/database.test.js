import { rejects } from "node:assert/strict";
import { MySqlContainer } from "@testcontainers/mysql";
import { expect } from "chai";
import { after, before, describe, it } from "mocha";
import { ForeignKeyConstraintError, UniqueConstraintError } from "sequelize";
import { runMigrations } from "../src/repositories/sequelize/migrations/index.js";
import { createSequelize } from "../src/repositories/sequelize/index.js";
import { categoryService } from "../src/services/category-service.js";

describe("MySQL schema and category catalog", function () {
  this.timeout(120_000);

  let mysql;
  let database;

  before(async () => {
    mysql = await new MySqlContainer("mysql:8.4").start();
    database = createSequelize({
      host: mysql.getHost(),
      port: mysql.getPort(),
      name: mysql.getDatabase(),
      user: mysql.getUsername(),
      password: mysql.getUserPassword(),
    });
    await runMigrations(database);
  });

  after(async () => {
    try {
      await database?.close();
    } finally {
      await mysql?.stop();
    }
  });

  it("reads the complete category catalog in ascending code order", async () => {
    const expectedCategories = await database.models.Category.findAll({
      order: [["code", "ASC"]],
      raw: true,
    });

    const categories = await categoryService({ database }).getCategories();

    expect(categories).to.not.be.empty;
    expect(categories).to.deep.equal(expectedCategories);
  });

  it("seeds categories once and resumes an interrupted migration without overwriting data", async () => {
    const { Category } = database.models;
    expect((await Category.findAll()).map(({ code }) => code)).to.have.members([
      "timeout", "connection_error", "dependency_failure", "resource_exhaustion",
      "configuration_error", "authentication_error", "invalid_data",
    ]);

    await Category.update({ description: "Descripción propia." }, { where: { code: "timeout" } });
    await Category.destroy({ where: { code: "invalid_data" } });
    await database.query("DELETE FROM schema_migrations WHERE name = '001-initial-schema'");

    await runMigrations(database);
    await runMigrations(database);

    expect(await Category.count()).to.equal(7);
    expect((await Category.findByPk("timeout")).description).to.equal("Descripción propia.");
    const [history] = await database.query("SELECT name FROM schema_migrations");
    expect(history).to.deep.equal([{ name: "001-initial-schema" }]);
  });

  it("loads selections and evidence through the models and enforces their foreign keys", async () => {
    const { Analysis, AnalysisLog, Category, Finding, FindingLog, Log } = database.models;
    const timestamp = new Date("2026-10-01T14:03:00.123Z");
    const log = await Log.create({
      timestamp, service: "checkout", level: "ERROR", message: "Timeout", traceId: "checkout-abc123",
    });
    const analysis = await Analysis.create();
    expect(analysis.status).to.equal("PENDING");
    await analysis.addLog(log);
    await rejects(AnalysisLog.create({ analysisId: analysis.id, logId: log.id }), UniqueConstraintError);
    await rejects(log.destroy(), ForeignKeyConstraintError);

    const findingData = {
      analysisId: analysis.id, description: "Timeout en checkout", suggestion: "Revisar latencia",
    };
    await rejects(Finding.create({ ...findingData, categoryCode: "missing" }), ForeignKeyConstraintError);
    const finding = await analysis.createFinding({ ...findingData, categoryCode: "timeout" });
    await finding.addEvidence(log);
    await rejects(FindingLog.create({ findingId: finding.id, logId: log.id }), UniqueConstraintError);

    const saved = await Analysis.findByPk(analysis.id, {
      include: ["logs", { association: "findings", include: ["category", "evidence"] }],
    });
    expect(saved.logs.map(({ id }) => id)).to.deep.equal([log.id]);
    expect(saved.logs[0].timestamp).to.deep.equal(timestamp);
    expect(saved.logs[0].traceId).to.equal("checkout-abc123");
    expect(saved.findings[0].category.code).to.equal("timeout");
    expect(saved.findings[0].evidence.map(({ id }) => id)).to.deep.equal([log.id]);

    await rejects(Category.destroy({ where: { code: "timeout" } }), ForeignKeyConstraintError);
    await analysis.destroy();
    expect(await Finding.findByPk(finding.id)).to.equal(null);
    expect(await AnalysisLog.count({ where: { analysisId: analysis.id } })).to.equal(0);
    expect(await FindingLog.count({ where: { findingId: finding.id } })).to.equal(0);
    await log.destroy();
  });
});
