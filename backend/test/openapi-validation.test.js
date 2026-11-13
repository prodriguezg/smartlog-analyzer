import { expect } from "chai";
import express from "express";
import { describe, it } from "mocha";
import { ConnectionError } from "sequelize";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createOpenApiValidationMiddleware } from "../src/middleware/openapi-validation-middleware.js";
import { createOpenAIProvider } from "../src/providers/openai.js";

describe("OpenAPI request validation", function () {
  const database = { models: { Log: { findAll: async () => [] } } };
  const api = request(createApp({ database }));

  it("accepts valid query parameters and rejects invalid pagination and dates", async function () {
    await api.get("/api/logs").query({ limit: 100, offset: 0 }).expect(200);

    for (const query of [
      { limit: 101 },
      { offset: -1 },
      { from: "2026-10-01T14:00:00" },
      { from: "2026-10-01T15:00:00Z", to: "2026-10-01T14:00:00Z" },
    ]) {
      const { body } = await api.get("/api/logs").query(query).expect(400);
      expect(body.error.code).to.equal("INVALID_REQUEST");
      expect(body.error.message).to.be.a("string").and.not.be.empty;
    }
  });

  it("rejects pagination and invalid date ranges for the log summary before reading MySQL", async function () {
    const apiWithoutDatabase = request(createApp({}));
    for (const query of [
      { limit: 1 },
      { from: "2026-10-01T14:00:00" },
      { from: "2026-10-01T14:00:00Z", to: "2026-10-01T14:00:00Z" },
    ]) {
      const { body } = await apiWithoutDatabase.get("/api/logs/summary").query(query).expect(400);
      expect(body.error.code).to.equal("INVALID_REQUEST");
    }
  });

  it("returns a 503 in the API error format when the log summary cannot connect to MySQL", async function () {
    const database = { query: async () => {
      throw new ConnectionError(new Error("Connection refused"));
    } };
    const { body } = await request(createApp({ database })).get("/api/logs/summary").expect(503);
    expect(body).to.deep.equal({
      error: { code: "DATABASE_UNAVAILABLE", message: "MySQL no está disponible." },
    });
  });

  it("validates required fields through the log request body schema reference", async function () {
    const { body } = await api.post("/api/logs").send({ service: "checkout" }).expect(400);

    expect(body.error.code).to.equal("INVALID_REQUEST");
    expect(body.error.message).to.include("timestamp");
  });

  it("applies the contract's body type to syntactically valid JSON", async function () {
    const { body } = await api.post("/api/logs").type("json").send("42").expect(400);

    expect(body.error.code).to.equal("INVALID_REQUEST");
    expect(body.error.message).to.include("object");
  });

  it("rejects combined analysis modes and string IDs", async function () {
    for (const payload of [{ filters: {}, logIds: [42] }, { logIds: ["42"] }]) {
      const { body } = await api.post("/api/logs/analyze").send(payload).expect(400);
      expect(body.error.code).to.equal("INVALID_REQUEST");
    }
  });

  it("rejects analysis when the OpenAI provider lacks local configuration", async function () {
    const llmProvider = createOpenAIProvider({});
    const { body } = await request(createApp({ llmProvider }))
      .post("/api/logs/analyze").send({ logIds: [1] }).expect(503);

    expect(body.error.code).to.equal("PROVIDER_UNAVAILABLE");
  });

  it("returns the API error format for malformed JSON", async function () {
    const { body } = await api.post("/api/logs").type("json").send('{"service":').expect(400);

    expect(body).to.deep.equal({
      error: { code: "INVALID_REQUEST", message: "El cuerpo debe ser JSON válido." },
    });
  });

  it("returns a JSON 413 before processing oversized request bodies", async function () {
    for (const path of ["/api/logs", "/api/logs/analyze"]) {
      const { body } = await request(createApp({})).post(path)
        .send({ message: "a".repeat(100 * 1024) })
        .expect("Content-Type", /json/)
        .expect(413);
      expect(body.error).to.deep.equal({
        code: "PAYLOAD_TOO_LARGE",
        message: "El cuerpo de la solicitud supera el límite permitido.",
      });
    }
  });

  it("returns a JSON error for an unknown API route", async function () {
    const { body } = await api.get("/api/unknown").expect("Content-Type", /json/).expect(404);
    expect(body.error).to.deep.equal({
      code: "ROUTE_NOT_FOUND",
      message: "La ruta solicitada no existe.",
    });
  });

  it("validates path parameters before calling the route handler", async function () {
    const app = express();
    app.use(createOpenApiValidationMiddleware({
      openapi: "3.1.0",
      info: { title: "Path parameter test", version: "1.0.0" },
      servers: [{ url: "/api" }],
      paths: {
        "/items/{id}": {
          get: {
            parameters: [{
              in: "path",
              name: "id",
              required: true,
              schema: { type: "integer", minimum: 1 },
            }],
            responses: { 204: { description: "Valid ID" } },
          },
        },
      },
    }));
    app.get("/api/items/:id", (_request, response) => response.sendStatus(204));

    await request(app).get("/api/items/42").expect(204);
    const { body } = await request(app).get("/api/items/0").expect(400);
    expect(body.error.code).to.equal("INVALID_REQUEST");
  });
});

describe("OpenAPI response validation", function () {
  it("matches the documented 200 response for a log page", async function () {
    const database = { models: { Log: { findAll: async () => [] } } };
    await request(createApp({ database, validateResponses: true }))
      .get("/api/logs")
      .expect("Content-Type", /json/)
      .expect(200);
  });

  it("matches the documented 503 response when MySQL is unavailable", async function () {
    const database = { query: async () => {
      throw new ConnectionError(new Error("Connection refused"));
    } };
    await request(createApp({ database, validateResponses: true }))
      .get("/api/logs/summary")
      .expect("Content-Type", /json/)
      .expect(503);
  });
});
