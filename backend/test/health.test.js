import { MySqlContainer } from "@testcontainers/mysql";
import { expect } from "chai";
import { after, before, describe, it } from "mocha";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createProvider } from "../src/providers/provider-factory.js";
import { createSequelize } from "../src/repositories/sequelize.js";

describe("GET /api/health with MySQL", function () {
  this.timeout(120_000);

  const llmProvider = createProvider({ env: { LLM_PROVIDER: "mock" } });
  let mysql;
  let database;
  let databaseConfig;

  before(async () => {
    mysql = await new MySqlContainer("mysql:8.4").start();
    databaseConfig = {
      host: mysql.getHost(),
      port: mysql.getPort(),
      name: mysql.getDatabase(),
      user: mysql.getUsername(),
      password: mysql.getUserPassword(),
    };
    database = createSequelize(databaseConfig);
  });

  after(async () => {
    try {
      await database?.close();
    } finally {
      await mysql?.stop();
    }
  });

  it("returns 200 and ok when MySQL and the mock provider are available", async () => {
    const response = await request(createApp({ database, llmProvider }))
      .get("/api/health")
      .expect("Cache-Control", "no-store")
      .expect(200);

    expect(response.body).to.deep.equal({
      status: "ok",
      checks: { database: "ok", provider: { status: "ok" } },
    });
  });

  it("returns 503 when the API cannot connect to MySQL", async () => {
    const rejectedDatabase = createSequelize({
      ...databaseConfig,
      password: "invalid-password",
    });

    try {
      const response = await request(createApp({ database: rejectedDatabase, llmProvider }))
        .get("/api/health")
        .expect(503);

      expect(response.body).to.deep.equal({
        status: "unavailable",
        checks: { database: "unavailable", provider: { status: "ok" } },
      });
    } finally {
      await rejectedDatabase.close();
    }
  });
});

describe("GET /api/health provider checks", function () {
  const database = { authenticate: async () => {} };
  const openAIEnv = {
    LLM_PROVIDER: "openai",
    OPENAI_API_KEY: "test-key",
    OPENAI_MODEL: "test-model",
  };

  it("returns 200 and ok when the configured OpenAI model is available", async () => {
    const llmProvider = createProvider({
      env: openAIEnv,
      fetch: async () => Response.json({ id: openAIEnv.OPENAI_MODEL }),
    });

    const { body } = await request(createApp({ database, llmProvider }))
      .get("/api/health")
      .expect(200);

    expect(body).to.deep.equal({
      status: "ok",
      checks: { database: "ok", provider: { status: "ok" } },
    });
  });

  it("returns 200 and degraded when OpenAI rejects the credentials", async () => {
    const llmProvider = createProvider({
      env: openAIEnv,
      fetch: async () => new Response(null, { status: 401 }),
    });

    const { body } = await request(createApp({ database, llmProvider }))
      .get("/api/health")
      .expect(200);

    expect(body).to.deep.equal({
      status: "degraded",
      checks: {
        database: "ok",
        provider: {
          status: "unavailable",
          reason: "OpenAI rechazó las credenciales o los permisos.",
        },
      },
    });
  });

  it("returns 503 with both checks when MySQL is down and OpenAI is unconfigured", async () => {
    const unavailableDatabase = {
      async authenticate() {
        throw new Error("MySQL is unavailable");
      },
    };
    const llmProvider = createProvider({ env: { LLM_PROVIDER: "openai" } });

    const { body } = await request(createApp({ database: unavailableDatabase, llmProvider }))
      .get("/api/health")
      .expect(503);

    expect(body).to.deep.equal({
      status: "unavailable",
      checks: {
        database: "unavailable",
        provider: {
          status: "unavailable",
          reason: "OpenAI requiere OPENAI_API_KEY y OPENAI_MODEL.",
        },
      },
    });
  });

  it("returns 200 and degraded when the provider check throws", async () => {
    const llmProvider = {
      async checkHealth() {
        throw new Error("Unexpected provider error");
      },
    };

    const { body } = await request(createApp({ database, llmProvider }))
      .get("/api/health")
      .expect(200);

    expect(body).to.deep.equal({
      status: "degraded",
      checks: {
        database: "ok",
        provider: {
          status: "unavailable",
          reason: "No se pudo comprobar el proveedor de análisis.",
        },
      },
    });
  });
});
