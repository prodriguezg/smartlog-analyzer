import { MySqlContainer } from "@testcontainers/mysql";
import { expect } from "chai";
import { after, before, beforeEach, describe, it } from "mocha";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createMockProvider } from "../src/providers/mock-llm.js";
import { createSequelize } from "../src/repositories/sequelize/index.js";
import { runMigrations } from "../src/repositories/sequelize/migrations/index.js";
import { analysisService } from "../src/services/analysis-service.js";
import { startAnalysisWorker } from "../src/workers/analysis-worker.js";

const timestamp = "2026-10-01T14:03:00.123Z";

describe("Analysis service with MySQL", function () {
  this.timeout(120_000);

  let mysql;
  let database;
  let api;

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
    api = request(createApp({ database }));
  });

  beforeEach(async () => {
    await database.models.Analysis.destroy({ where: {} });
    await database.models.Log.destroy({ where: {} });
  });

  after(async () => {
    try {
      await database?.close();
    } finally {
      await mysql?.stop();
    }
  });

  async function createLog(overrides = {}) {
    const { body } = await api.post("/api/logs").send({
      timestamp, service: "checkout", level: "ERROR", message: "Timeout", ...overrides,
    }).expect(201);
    return body.id;
  }

  async function submitAnalysis(...logIds) {
    const { body } = await api.post("/api/logs/analyze").send({ logIds }).expect(202);
    expect(body.status).to.equal("PENDING");
    return body.id;
  }

  it("processes saved selections in order and exposes the pending and completed states", async () => {
    const logId = await createLog();
    const excludedId = await createLog({ message: "Servicio disponible" });
    const id = await submitAnalysis(logId);
    const nextId = await submitAnalysis(excludedId);
    const { promise: started, resolve: markStarted } = Promise.withResolvers();
    const { promise: resume, resolve: allowReport } = Promise.withResolvers();
    const mock = createMockProvider();
    const llmProvider = {
      ...mock,
      async analyze(input) {
        markStarted(input);
        await resume;
        return mock.analyze(input);
      },
    };
    const service = analysisService({ database, llmProvider });
    const processing = service.processNextAnalysis();

    try {
      expect(service.processNextAnalysis()).to.equal(processing);
      const { logs, categories } = await Promise.race([
        started,
        processing.then(() => { throw new Error("The analysis finished before invoking the provider"); }),
      ]);
      expect(logs.map(({ id }) => id)).to.deep.equal([logId]);
      expect(categories.map(({ code }) => code)).to.include("timeout");
      const { body } = await api.get(`/api/analysis/${id}`).expect(200);
      expect(body).to.have.all.keys("id", "status", "createdAt", "logIds");
      expect(body.status).to.equal("PENDING");
      expect(body.logIds).to.deep.equal([logId]);
    } finally {
      allowReport();
      await processing;
    }

    const { body } = await api.get(`/api/analysis/${id}`).expect(200);
    expect(body.status).to.equal("COMPLETED");
    expect(body.provider).to.equal("mock");
    expect(body.finishedAt).to.be.a("string");
    expect(body.report.summary).to.include("1 hallazgo");
    expect(body.report.findings).to.have.length(1);
    expect(body.report.findings[0]).to.deep.include({
      category: "timeout",
      analysisId: id,
      evidence: [{ id: logId, timestamp, service: "checkout", level: "ERROR", message: "Timeout" }],
    });
    expect((await service.getAnalysis(nextId)).status).to.equal("PENDING");
    expect(await service.processNextAnalysis()).to.equal(true);
    expect((await service.getAnalysis(nextId)).report.findings).to.deep.equal([]);
    expect(await service.processNextAnalysis()).to.equal(false);
  });

  it("pages only finalized analyses in descending creation order and breaks ties by ID", async () => {
    const validated = request(createApp({ database, validateResponses: true }));
    const empty = { items: [], limit: 50, offset: 0, hasMore: false };
    await validated.get("/api/analysis").expect(200, empty);

    const { Analysis } = database.models;
    const [older, first, second] = await Analysis.bulkCreate([
      { status: "COMPLETED", createdAt: "2026-10-01T14:00:00.000Z", provider: "mock" },
      { status: "FAILED", createdAt: timestamp, provider: null },
      { status: "COMPLETED", createdAt: timestamp, provider: "openai" },
      { status: "PENDING", createdAt: "2026-10-01T15:00:00.000Z" },
    ]);

    await validated.get("/api/analysis").query({ limit: 2 }).expect(200, {
      items: [
        { id: second.id, status: "COMPLETED", createdAt: timestamp, provider: "openai" },
        { id: first.id, status: "FAILED", createdAt: timestamp, provider: null },
      ],
      limit: 2, offset: 0, hasMore: true,
    });
    await validated.get("/api/analysis").query({ limit: 2, offset: 2 }).expect(200, {
      items: [{ id: older.id, status: "COMPLETED", createdAt: "2026-10-01T14:00:00.000Z", provider: "mock" }],
      limit: 2, offset: 2, hasMore: false,
    });
    await validated.get("/api/analysis").query({ offset: 3 }).expect(200, { ...empty, offset: 3 });
    await validated.get("/api/analysis").query({ limit: 101 }).expect(400);
    await validated.get("/api/analysis").query({ offset: -1 }).expect(400);
  });

  it("filters and pages findings while returning all of each finding's evidence", async () => {
    const first = await createLog();
    const second = await createLog({ traceId: "checkout-123" });
    const outsideRange = await createLog({ timestamp: "2026-10-01T15:00:00.123Z" });
    const otherService = await createLog({ service: "payments" });
    const older = await submitAnalysis(first);
    const newer = await submitAnalysis(first, second, outsideRange, otherService);
    const excluded = await submitAnalysis(outsideRange, otherService);
    const service = analysisService({ database, llmProvider: createMockProvider() });
    for (let index = 0; index < 3; index += 1) await service.processNextAnalysis();
    await database.models.Finding.update({ createdAt: timestamp }, { where: {} });

    const query = { service: "checkout", from: timestamp, to: "2026-10-01T15:00:00.123Z", limit: 1 };
    const { body: page } = await api.get("/api/analysis/findings")
      .query({ ...query, category: "timeout" }).expect(200);
    expect(page).to.include({ limit: 1, offset: 0, hasMore: true });
    expect(page.items.map(({ analysisId }) => analysisId)).to.deep.equal([newer]);
    expect(page.items[0].evidence.map(({ id }) => id)).to.deep.equal([first, second, outsideRange, otherService]);
    expect(page.items[0].evidence[1].traceId).to.equal("checkout-123");

    const { body: last } = await api.get("/api/analysis/findings").query({ ...query, offset: 1 }).expect(200);
    expect(last.hasMore).to.equal(false);
    expect(last.items.map(({ analysisId }) => analysisId)).to.deep.equal([older]);
    const { body: unfiltered } = await api.get("/api/analysis/findings").expect(200);
    expect(unfiltered.items.map(({ analysisId }) => analysisId)).to.deep.equal([excluded, newer, older]);
    const { body: empty } = await api.get("/api/analysis/findings")
      .query({ category: "invalid_data" }).expect(200);
    expect(empty).to.deep.equal({ items: [], limit: 50, offset: 0, hasMore: false });
    await api.get("/api/analysis/findings").query({ from: timestamp, to: timestamp }).expect(400);
    await api.get("/api/analysis/0").expect(400);
    const { body: missing } = await api.get("/api/analysis/4294967295").expect(404);
    expect(missing.error.code).to.equal("ANALYSIS_NOT_FOUND");
  });

  it("rejects invalid reports and evidence without saving partial findings", async () => {
    const selected = await createLog();
    const excluded = await createLog();
    const finding = {
      category: "timeout", description: "Tiempo de espera agotado.",
      suggestion: "Revisar latencia.", evidenceLogIds: [selected],
    };
    const reports = [
      { findings: [] },
      { summary: "Informe", findings: [finding, { ...finding, category: "unknown" }] },
      { summary: "Informe", findings: [finding, { ...finding, evidenceLogIds: [excluded] }] },
      { summary: "Informe", findings: [finding, { ...finding, evidenceLogIds: [] }] },
    ];

    for (const report of reports) {
      const id = await submitAnalysis(selected);
      const service = analysisService({ database, llmProvider: { ...createMockProvider(), analyze: async () => report } });
      await service.processNextAnalysis();
      const { body } = await api.get(`/api/analysis/${id}`).expect(200);
      expect(body).to.have.all.keys("id", "status", "createdAt", "logIds", "finishedAt", "provider", "error");
      expect(body.status).to.equal("FAILED");
      expect(body.provider).to.equal("mock");
      expect(body.error.code).to.equal("INVALID_PROVIDER_RESPONSE");
      expect(body.logIds).to.deep.equal([selected]);
    }
    expect(await database.models.Finding.count()).to.equal(0);
    expect(await database.models.FindingLog.count()).to.equal(0);
  });

  it("records provider timeouts and generic provider errors", async () => {
    const logId = await createLog();
    for (const code of ["PROVIDER_TIMEOUT", "PROVIDER_ERROR"]) {
      const id = await submitAnalysis(logId);
      const service = analysisService({
        database,
        llmProvider: {
          name: "openai",
          async analyze() {
            throw Object.assign(new Error("Provider details"), { code });
          },
        },
      });
      await service.processNextAnalysis();
      const { body } = await api.get(`/api/analysis/${id}`).expect(200);
      expect(body.status).to.equal("FAILED");
      expect(body.provider).to.equal("openai");
      expect(body.error.code).to.equal(code);
      expect(body.error.message).to.be.a("string").and.not.equal("Provider details");
    }
  });

  it("rolls back completion and findings if saving evidence fails", async () => {
    const id = await submitAnalysis(await createLog());
    const { Analysis, Finding, FindingLog } = database.models;
    FindingLog.addHook("afterBulkCreate", "failEvidence", () => {
      throw new Error("Evidence write interrupted");
    });

    try {
      const service = analysisService({ database, llmProvider: createMockProvider() });
      await service.processNextAnalysis();
      const saved = await Analysis.findByPk(id);
      expect(saved).to.include({ status: "FAILED", provider: "mock", summary: null, errorCode: "ANALYSIS_ERROR" });
      expect(await Finding.count()).to.equal(0);
      expect(await FindingLog.count()).to.equal(0);
    } finally {
      FindingLog.removeHook("afterBulkCreate", "failEvidence");
    }
  });

  it("marks interrupted analyses at startup and lets the worker process a new submission", async () => {
    const logId = await createLog();
    const interrupted = await submitAnalysis(logId);
    const service = analysisService({ database, llmProvider: createMockProvider() });
    await service.failInterruptedAnalyses();
    const { body } = await api.get(`/api/analysis/${interrupted}`).expect(200);
    expect(body.status).to.equal("FAILED");
    expect(body.provider).to.equal(null);
    expect(body.error.code).to.equal("ANALYSIS_INTERRUPTED");
    expect(body.logIds).to.deep.equal([logId]);

    const retry = await submitAnalysis(...body.logIds);
    const stop = startAnalysisWorker(service);
    await stop();

    expect(retry).not.to.equal(interrupted);
    expect((await service.getAnalysis(retry)).status).to.equal("COMPLETED");
    expect((await service.getAnalysis(interrupted)).status).to.equal("FAILED");
  });
});
