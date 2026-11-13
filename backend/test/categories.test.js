import { expect } from "chai";
import { describe, it } from "mocha";
import request from "supertest";
import { createApp } from "../src/app.js";

describe("GET /api/categories", function () {
  it("returns the category codes and descriptions as JSON", async () => {
    const categories = [
      { code: "connection_error", description: "No se pudo establecer una conexión." },
      { code: "timeout", description: "La operación excedió el tiempo de espera." },
    ];
    const database = { query: async () => [categories, {}] };

    const { body } = await request(createApp({ database }))
      .get("/api/categories")
      .expect("Content-Type", /json/)
      .expect(200);

    expect(body).to.deep.equal({ op: "categories", data: categories });
  });

  it("returns an empty array when there are no categories", async () => {
    const database = { query: async () => [[], {}] };

    const { body } = await request(createApp({ database }))
      .get("/api/categories")
      .expect(200);

    expect(body).to.deep.equal({ op: "categories", data: [] });
  });

  it("rejects unsupported query parameters before querying the database", async () => {
    let queryCount = 0;
    const database = {
      async query() {
        queryCount += 1;
        return [[], {}];
      },
    };

    const { body } = await request(createApp({ database }))
      .get("/api/categories")
      .query({ limit: 1 })
      .expect(400);

    expect(body.error.code).to.equal("INVALID_REQUEST");
    expect(body.error.message).to.include("limit");
    expect(queryCount).to.equal(0);
  });

  it("returns a generic error when the database query fails", async () => {
    const database = {
      async query() {
        throw new Error("MySQL connection lost");
      },
    };

    const { body } = await request(createApp({ database }))
      .get("/api/categories")
      .expect("Content-Type", /json/)
      .expect(500);

    expect(body).to.deep.equal({ error: "Failed to retrieve categories" });
  });
});
