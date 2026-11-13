const tableOptions = "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_as_cs";

const tables = [
  `CREATE TABLE IF NOT EXISTS logs (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    event_at DATETIME(3) NOT NULL,
    service MEDIUMTEXT NOT NULL,
    level MEDIUMTEXT NOT NULL,
    message MEDIUMTEXT NOT NULL,
    trace_id MEDIUMTEXT,
    INDEX logs_event_at_id (event_at, id),
    INDEX logs_service_event_at (service(128), event_at),
    INDEX logs_level_event_at (level(32), event_at),
    INDEX logs_trace_id_event_at (trace_id(128), event_at)
  ) ${tableOptions}`,
  `CREATE TABLE IF NOT EXISTS analyses (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    status ENUM('PENDING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    finished_at DATETIME(3),
    summary TEXT,
    error_code VARCHAR(64),
    error_message TEXT,
    INDEX analyses_status_id (status, id)
  ) ${tableOptions}`,
  `CREATE TABLE IF NOT EXISTS categories (
    code VARCHAR(64) NOT NULL PRIMARY KEY,
    description TEXT NOT NULL
  ) ${tableOptions}`,
  `CREATE TABLE IF NOT EXISTS analysis_logs (
    analysis_id INT UNSIGNED NOT NULL,
    log_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (analysis_id, log_id),
    FOREIGN KEY (analysis_id) REFERENCES analyses(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (log_id) REFERENCES logs(id) ON DELETE RESTRICT ON UPDATE CASCADE
  ) ${tableOptions}`,
  `CREATE TABLE IF NOT EXISTS findings (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    analysis_id INT UNSIGNED NOT NULL,
    category_code VARCHAR(64) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    description TEXT NOT NULL,
    suggestion TEXT NOT NULL,
    FOREIGN KEY (analysis_id) REFERENCES analyses(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (category_code) REFERENCES categories(code) ON DELETE RESTRICT ON UPDATE CASCADE,
    INDEX findings_created_at_id (created_at, id),
    INDEX findings_category_created_at_id (category_code, created_at, id)
  ) ${tableOptions}`,
  `CREATE TABLE IF NOT EXISTS finding_logs (
    finding_id INT UNSIGNED NOT NULL,
    log_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (finding_id, log_id),
    FOREIGN KEY (finding_id) REFERENCES findings(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (log_id) REFERENCES logs(id) ON DELETE RESTRICT ON UPDATE CASCADE
  ) ${tableOptions}`,
];

const categories = [
  ["timeout", "Una operación superó el tiempo de espera configurado."],
  ["connection_error", "No se pudo establecer o mantener una conexión de red."],
  ["dependency_failure", "Un servicio dependiente no estaba disponible o devolvió un error."],
  ["resource_exhaustion", "Se agotó un recurso como memoria, espacio en disco o conexiones."],
  ["configuration_error", "Falta una configuración requerida o su valor es inválido."],
  ["authentication_error", "Se rechazaron las credenciales o faltan permisos para la operación."],
  ["invalid_data", "Los datos tienen un formato inválido o incumplen una regla de validación."],
];

export const initialSchema = {
  name: "001-initial-schema",

  async up(database) {
    // MySQL commits each DDL statement, so each table can be created again safely on retry.
    for (const statement of tables) {
      await database.query(statement);
    }

    await database.query(`
      INSERT INTO categories (code, description)
      VALUES ${categories.map(() => "(?, ?)").join(", ")}
      ON DUPLICATE KEY UPDATE code = categories.code
    `, { replacements: categories.flat() });
  },
};
