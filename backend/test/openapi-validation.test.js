import { expect } from "chai";
import express from "express";
import { describe, it } from "mocha";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createOpenApiValidationMiddleware } from "../src/middleware/openapi-validation-middleware.js";

describe("OpenAPI request validation", function () {
  const api = request(createApp({}));

  it("accepts valid query parameters and rejects invalid pagination and dates", async function () {
    await api.get("/api/logs").query({ limit: 100, offset: 0 }).expect(200);

    for (const query of [{ limit: 101 }, { offset: -1 }, { from: "2026-10-01T14:00:00" }]) {
      const { body } = await api.get("/api/logs").query(query).expect(400);
      expect(body.error.code).to.equal("INVALID_REQUEST");
      expect(body.error.message).to.be.a("string").and.not.be.empty;
    }
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

  it("returns the API error format for malformed JSON", async function () {
    const { body } = await api.post("/api/logs").type("json").send('{"service":').expect(400);

    expect(body).to.deep.equal({
      error: { code: "INVALID_REQUEST", message: "El cuerpo debe ser JSON válido." },
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
