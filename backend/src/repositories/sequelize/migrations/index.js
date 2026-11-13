import { readdir } from "node:fs/promises";
import { QueryTypes } from "sequelize";

async function readMigrationFiles() {
  const directory = new URL(".", import.meta.url);
  const entries = await readdir(directory, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && /^\d{3,}/.test(entry.name) && entry.name.endsWith(".js"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));

  const migrations = new Map();
  for (const file of files) {
    const exports = await import(new URL(encodeURIComponent(file), directory).href);
    const migration = Object.values(exports).find((value) =>
      typeof value?.name === "string" && value.name.length > 0 && typeof value.up === "function",
    );
    if (!migration) {
      throw new Error(`Migration ${file} must export an object with a name and an up function.`);
    }
    if (migrations.has(migration.name)) {
      throw new Error(`Duplicate migration name "${migration.name}" in ${file}.`);
    }
    migrations.set(migration.name, migration);
  }

  return migrations.values();
}

export async function runMigrations(database) {
  const migrations = await readMigrationFiles();

  await database.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) NOT NULL PRIMARY KEY,
      applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_as_cs
  `);

  const applied = await database.query("SELECT name FROM schema_migrations", {
    type: QueryTypes.SELECT,
  });
  const appliedNames = new Set(applied.map(({ name }) => name));

  for (const migration of migrations) {
    if (appliedNames.has(migration.name)) continue;

    await migration.up(database);
    await database.query(
      `
      INSERT INTO schema_migrations (name) VALUES (?)
      ON DUPLICATE KEY UPDATE name = schema_migrations.name
    `,
      { replacements: [migration.name] },
    );
  }
}
