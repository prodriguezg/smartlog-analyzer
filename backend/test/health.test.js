import { MySqlContainer } from "@testcontainers/mysql";
import { expect } from "chai";
import { after, before, describe, it } from "mocha";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createSequelize } from "../src/repositories/sequelize.js";

describe("GET /api/health", function () {
  this.timeout(120_000);

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

  it("returns 200 when the API can query MySQL", async () => {
    const response = await request(createApp({ database }))
      .get("/api/health");
      // .expect(200);

    expect(response.body).to.deep.equal({
      status: "ok",
      checks: { database: "ok" },
    });
  });

  it("returns 503 when the API cannot connect to MySQL", async () => {
    const rejectedDatabase = createSequelize({
      ...databaseConfig,
      password: "invalid-password",
    });

    try {
      const response = await request(createApp({ database: rejectedDatabase }))
        .get("/api/health")
        .expect(503);

      expect(response.body).to.deep.equal({
        status: "unavailable",
        checks: { database: "unavailable" },
      });
    } finally {
      await rejectedDatabase.close();
    }
  });
});
