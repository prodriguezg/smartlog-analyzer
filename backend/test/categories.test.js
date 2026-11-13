import { expect } from "chai";
import { describe, it } from "mocha";
import { ConnectionError } from "sequelize";
import request from "supertest";
import { createApp } from "../src/app.js";

describe("GET /api/categories", function () {
  function createApi(findAll) {
    return request(createApp({ database: { models: { Category: { findAll } } } }));
  }

  it("returns the category codes and descriptions as JSON", async () => {
    const categories = [
      { code: "connection_error", description: "No se pudo establecer una conexión." },
      { code: "timeout", description: "La operación excedió el tiempo de espera." },
    ];
    const { body } = await createApi(async () => categories)
      .get("/api/categories")
      .expect("Content-Type", /json/)
      .expect(200);

    expect(body).to.deep.equal({ items: categories });
  });

  it("returns an empty array when there are no categories", async () => {
    const { body } = await createApi(async () => [])
      .get("/api/categories")
      .expect(200);

    expect(body).to.deep.equal({ items: [] });
  });

  it("rejects unsupported query parameters before querying the database", async () => {
    let queryCount = 0;
    const api = createApi(async () => {
      queryCount += 1;
      return [];
    });

    const { body } = await api
      .get("/api/categories")
      .query({ limit: 1 })
      .expect(400);

    expect(body.error.code).to.equal("INVALID_REQUEST");
    expect(body.error.message).to.include("limit");
    expect(queryCount).to.equal(0);
  });

  it("returns a generic error when the database query fails", async () => {
    const { body } = await createApi(async () => {
      throw new Error("Unexpected database error");
    })
      .get("/api/categories")
      .expect("Content-Type", /json/)
      .expect(500);

    expect(body).to.deep.equal({
      error: { code: "INTERNAL_ERROR", message: "Failed to retrieve categories" },
    });
  });

  it("returns 503 when MySQL is unavailable", async () => {
    const { body } = await createApi(async () => {
      throw new ConnectionError(new Error("Connection refused"));
    })
      .get("/api/categories")
      .expect(503);

    expect(body).to.deep.equal({
      error: { code: "DATABASE_UNAVAILABLE", message: "MySQL no está disponible." },
    });
  });
});
