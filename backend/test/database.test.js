import { rejects } from "node:assert/strict";
import { MySqlContainer } from "@testcontainers/mysql";
import { expect } from "chai";
import { after, before, describe, it } from "mocha";
import { ForeignKeyConstraintError, UniqueConstraintError } from "sequelize";
import request from "supertest";
import { readAnalysisLimits } from "../src/analysis-limits.js";
import { createApp } from "../src/app.js";
import { createProvider } from "../src/providers/provider-factory.js";
import { runMigrations } from "../src/repositories/sequelize/migrations/index.js";
import { createSequelize } from "../src/repositories/sequelize/index.js";
import { analysisService } from "../src/services/analysis-service.js";

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

    const { body } = await request(createApp({ database })).get("/api/categories").expect(200);

    expect(body.items).to.have.lengthOf(7);
    expect(body).to.deep.equal({ items: expectedCategories });
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
    const [history] = await database.query("SELECT name FROM schema_migrations ORDER BY name");
    expect(history).to.deep.equal([
      { name: "001-initial-schema" },
      { name: "002-seed-example-logs" },
      { name: "003-seed-demo-data" },
    ]);
  });

  it("seeds example logs once and exposes their shared traces through the API", async () => {
    const { Log } = database.models;
    const count = await Log.count();
    await runMigrations(database);
    expect(await Log.count()).to.equal(count);
    expect(await Log.count({ where: { traceId: null } })).to.be.greaterThan(0);

    const traceId = "1d42b7d538724fae95c962e3d06cc5db";
    const { body } = await request(createApp({ database })).get("/api/logs").query({ traceId }).expect(200);

    expect(new Set(body.items.map((log) => log.service))).to.deep.equal(new Set([
      "checkout-api", "inventory-service", "payment-service",
    ]));
    expect(body.items.every((log) => log.traceId === traceId)).to.equal(true);
    expect(body.items[0]).to.include({ service: "checkout-api", level: "ERROR" });
  });

  it("restores the demo analyses, selections and evidence once", async () => {
    const { Analysis, Finding, AnalysisLog, FindingLog } = database.models;
    await runMigrations(database);
    expect(await Analysis.count()).to.equal(2);
    expect(await Finding.count()).to.equal(3);
    expect(await AnalysisLog.count()).to.equal(11);
    expect(await FindingLog.count()).to.equal(3);

    const api = request(createApp({ database }));
    const { body: page } = await api.get("/api/analysis").expect(200);
    const expected = [
      {
        createdAt: "2026-11-13T15:01:29.461Z",
        logIds: [6, 7, 14, 15, 18, 20, 23, 24, 28, 31],
        evidence: [["resource_exhaustion", [20]], ["timeout", [23]]],
      },
      { createdAt: "2026-11-13T15:00:24.598Z", logIds: [23], evidence: [["timeout", [23]]] },
    ];
    expect(page.items).to.have.lengthOf(expected.length);
    for (const [index, { id, status, provider, createdAt }] of page.items.entries()) {
      expect({ status, provider, createdAt }).to.deep.equal({
        status: "COMPLETED", provider: "mock", createdAt: expected[index].createdAt,
      });
      const { body } = await api.get(`/api/analysis/${id}`).expect(200);
      expect(body.logIds).to.deep.equal(expected[index].logIds);
      expect(body.report.findings.map(({ category, evidence }) => [category, evidence.map(({ id }) => id)]))
        .to.deep.equal(expected[index].evidence);
    }
  });

  it("seeds new demo traces and makes them available through log filters", async () => {
    const api = request(createApp({ database }));
    const interval = { from: "2026-11-13T13:41:00Z", to: "2026-11-13T13:57:00Z" };
    const { body: page } = await api.get("/api/logs").query(interval).expect(200);
    expect(page.items).to.have.lengthOf(36);
    expect(new Set(page.items.map(({ traceId }) => traceId).filter(Boolean)).size).to.equal(6);
    const { body: trace } = await api.get("/api/logs").query({
      traceId: "ba8b9b4992b54c8ba0d4346d24e1d7db",
    }).expect(200);
    expect(trace.items).to.have.lengthOf(8);
    expect(new Set(trace.items.map(({ service }) => service))).to.deep.equal(new Set([
      "checkout-api", "inventory-service", "payment-service", "notification-service",
    ]));
  });

  it("generates mock findings from the seeded logs selected through the API", async () => {
    const llmProvider = createProvider({ env: {} });
    const api = request(createApp({ database, llmProvider }));
    const worker = analysisService({ database, llmProvider });
    const interval = { from: "2026-11-12T14:02:00Z", to: "2026-11-12T14:11:00Z" };

    async function analyze(filters) {
      const { body: accepted } = await api.post("/api/logs/analyze").send({ filters }).expect(202);
      expect(await worker.processNextAnalysis()).to.equal(true);
      const { body } = await api.get(`/api/analysis/${accepted.id}`).expect(200);
      expect(body.status).to.equal("COMPLETED");
      return body;
    }

    const analysis = await analyze(interval);
    expect(analysis.logIds).to.have.lengthOf(31);
    expect(analysis.report.summary).to.include("3 hallazgos");

    const evidence = Object.fromEntries(analysis.report.findings.map((finding) => [
      finding.category,
      finding.evidence.map(({ message }) => message.split(" order_id=")[0]),
    ]));
    expect(evidence).to.deep.equal({
      timeout: ["Payment provider connection timeout", "Checkout failed after payment timeout"],
      dependency_failure: ["Payment provider unavailable"],
      resource_exhaustion: ["Insufficient stock", "Checkout rejected"],
    });
    for (const finding of analysis.report.findings) {
      expect(analysis.logIds).to.include.members(finding.evidence.map(({ id }) => id));
    }

    const recoveredTrace = "6fd302f0ab554ce8998ae2aee1139d3b";
    const recovered = await analyze({ traceId: recoveredTrace });
    expect(recovered.report.findings.map(({ category }) => category)).to.deep.equal(["dependency_failure"]);
    expect(recovered.report.findings[0].evidence[0].traceId).to.equal(recoveredTrace);

    for (const traceId of ["cbcd72a35d0643b7b183f67dfef045a6", "4ef7a24c37af4ce1b789838540d2e58a"]) {
      const result = await analyze({ traceId });
      expect(result.report.findings).to.deep.equal([]);
    }
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

  it("saves and lists logs, then accepts a pending analysis with the selected IDs", async () => {
    const api = request(createApp({ database }));
    const service = "analysis-test";
    const timestamp = "2026-10-01T14:00:00.000Z";
    const payload = { timestamp, service, level: "ERROR", message: "Timeout" };
    const { body: first } = await api.post("/api/logs").send(payload).expect(201);
    const { body: second } = await api.post("/api/logs")
      .send({ ...payload, traceId: "analysis-test-trace" })
      .expect(201);

    const filters = { service, from: timestamp, to: "2026-10-01T15:00:00Z" };
    const { body: page } = await api.get("/api/logs").query({ ...filters, limit: 1 }).expect(200);
    expect(page).to.deep.equal({
      items: [{ ...payload, id: second.id, traceId: "analysis-test-trace" }],
      limit: 1, offset: 0, hasMore: true,
    });
    const { body: nextPage } = await api.get("/api/logs").query({ ...filters, limit: 1, offset: 1 })
      .expect(200);
    expect(nextPage.items).to.deep.equal([{ ...payload, id: first.id }]);
    expect(nextPage.hasMore).to.equal(false);

    const { body: analysis } = await api.post("/api/logs/analyze").send({ filters }).expect(202);
    expect(analysis.status).to.equal("PENDING");
    const saved = await database.models.Analysis.findByPk(analysis.id, { include: "logs" });
    expect(saved.status).to.equal("PENDING");
    expect(saved.logs.map(({ id }) => id)).to.have.members([first.id, second.id]);

    const { body: byIds } = await api.post("/api/logs/analyze")
      .send({ logIds: [first.id, first.id] })
      .expect(202);
    const explicit = await database.models.Analysis.findByPk(byIds.id, { include: "logs" });
    expect(explicit.logs.map(({ id }) => id)).to.deep.equal([first.id]);
  });

  it("counts logs by service and level after applying the summary filters", async () => {
    const { Log } = database.models;
    const traceId = "summary-test-trace";
    const from = "2026-10-01T14:00:00.123Z";
    const to = "2026-10-01T15:00:00.456Z";
    const checkout = { timestamp: from, service: "summary-checkout", level: "ERROR", message: "Example", traceId };
    await Log.bulkCreate([
      checkout,
      { ...checkout, timestamp: "2026-10-01T15:00:00.455Z" },
      { ...checkout, level: "WARN" },
      { ...checkout, service: "summary-payments" },
      { ...checkout, timestamp: "2026-10-01T14:00:00.122Z" },
      { ...checkout, timestamp: to },
      { ...checkout, traceId: "other-trace" },
    ]);

    const api = request(createApp({ database }));
    const summary = "/api/logs/summary";
    const filters = { traceId, from, to };
    const { body } = await api.get(summary).query(filters).expect(200);
    expect(body).to.deep.equal({
      items: [
        { service: "summary-checkout", level: "ERROR", count: 2 },
        { service: "summary-checkout", level: "WARN", count: 1 },
        { service: "summary-payments", level: "ERROR", count: 1 },
      ],
    });

    const { body: filtered } = await api.get(summary)
      .query({ ...filters, service: "summary-checkout", level: "ERROR" }).expect(200);
    expect(filtered).to.deep.equal({ items: [{ service: "summary-checkout", level: "ERROR", count: 2 }] });

    const { body: empty } = await api.get(summary).query({ ...filters, level: "INFO" }).expect(200);
    expect(empty).to.deep.equal({ items: [] });

    const { body: quoted } = await api.get(summary)
      .query({ ...filters, service: "summary-checkout' OR 1=1 -- " }).expect(200);
    expect(quoted).to.deep.equal({ items: [] });
  });

  it("rolls back a pending analysis when saving its selection fails", async () => {
    const { Analysis, AnalysisLog, Log } = database.models;
    const log = await Log.create({
      timestamp: "2026-10-01T14:00:00Z", service: "rollback-test", level: "ERROR", message: "Timeout",
    });
    const analysesBefore = await Analysis.count();
    const selectionsBefore = await AnalysisLog.count();
    AnalysisLog.addHook("afterBulkCreate", "failSelection", () => {
      throw new Error("Selection write interrupted");
    });

    try {
      await request(createApp({ database })).post("/api/logs/analyze").send({ logIds: [log.id] }).expect(500);
      expect(await Analysis.count()).to.equal(analysesBefore);
      expect(await AnalysisLog.count()).to.equal(selectionsBefore);
    } finally {
      AnalysisLog.removeHook("afterBulkCreate", "failSelection");
    }
  });

  it("rejects invalid analysis selections before creating a pending analysis", async () => {
    const { Analysis, Log } = database.models;
    const log = await Log.create({
      timestamp: "2026-10-01T14:00:00Z",
      service: "selection-limit-test",
      level: "ERROR",
      message: "á".repeat(17_000),
    });
    const api = request(createApp({ database }));
    const analysesBefore = await Analysis.count();
    const selections = [
      [{ logIds: [] }, "EMPTY_SELECTION"],
      [{ logIds: [log.id + 1] }, "LOG_IDS_NOT_FOUND"],
      [{ logIds: [log.id] }, "SELECTION_TOO_LARGE"],
      [{ logIds: Array.from({ length: 101 }, (_, index) => index + 1) }, "SELECTION_TOO_LARGE"],
    ];

    for (const [selection, code] of selections) {
      const { body } = await api.post("/api/logs/analyze").send(selection).expect(422);
      expect(body.error.code).to.equal(code);
    }
    expect(await Analysis.count()).to.equal(analysesBefore);
  });

  it("applies configured count and byte limits without saving rejected analyses", async () => {
    const { Analysis, Log } = database.models;
    const sample = {
      timestamp: "2026-10-01T14:00:00Z", service: "configured-limit-test", level: "INFO", message: "Example",
    };
    const first = await Log.create(sample);
    const second = await Log.create({ ...sample, message: "á".repeat(600) });
    const analysisLimits = readAnalysisLimits({ ANALYSIS_MAX_LOGS: "1", ANALYSIS_MAX_KIB: "1" });
    const api = request(createApp({ database, analysisLimits }));
    const before = await Analysis.count();

    for (const selection of [{ logIds: [first.id, second.id] }, { filters: { service: sample.service } }]) {
      const { body } = await api.post("/api/logs/analyze").send(selection).expect(422);
      expect(body.error.code).to.equal("SELECTION_TOO_LARGE");
      expect(body.error.message).to.include("1 logs");
    }
    const { body } = await api.post("/api/logs/analyze").send({ logIds: [second.id] }).expect(422);
    expect(body.error.code).to.equal("SELECTION_TOO_LARGE");
    expect(body.error.message).to.include("1 KiB");
    expect(await Analysis.count()).to.equal(before);

    await api.post("/api/logs/analyze").send({ logIds: [first.id] }).expect(202);
    expect(await Analysis.count()).to.equal(before + 1);
  });
});
