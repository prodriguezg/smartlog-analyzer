import { QueryTypes } from "sequelize";

// Identify the referenced 002 logs independently of their auto-increment IDs.
const checkoutLogs = {
  successfulCheckout: ["14:02:10.230", "Checkout completed order_id=ord-7012 status=201 duration_ms=209"],
  recoveredRequest: ["14:04:33.110", "Checkout received method=POST path=/v1/checkout order_id=ord-7013 items=1"],
  recoveredCheckout: ["14:04:33.591", "Checkout completed order_id=ord-7013 status=201 duration_ms=481"],
  timedOutRequest: ["14:06:17.002", "Checkout received method=POST path=/v1/checkout order_id=ord-7014 items=1"],
  outOfStockRequest: ["14:06:17.908", "Checkout received method=POST path=/v1/checkout order_id=ord-7015 items=3"],
  outOfStockCheckout: ["14:06:17.945", "Checkout rejected order_id=ord-7015 status=409 reason=OUT_OF_STOCK duration_ms=37"],
  timedOutCheckout: ["14:06:19.096", "Checkout failed after payment timeout order_id=ord-7014 status=504 duration_ms=2094"],
  declinedRequest: ["14:08:45.327", "Checkout received method=POST path=/v1/checkout order_id=ord-7016 items=1"],
  declinedCheckout: ["14:08:45.558", "Checkout rejected order_id=ord-7016 status=402 reason=PAYMENT_DECLINED duration_ms=231"],
  readinessProbe: ["14:10:03.121", "Readiness probe passed path=/readyz status=200 duration_ms=3"],
};

const timeoutFinding = {
  categoryCode: "timeout",
  description: "Hay evidencia de operaciones que excedieron el tiempo de espera.",
  suggestion: "Revisar la latencia y los límites de tiempo de los servicios afectados.",
  evidence: ["timedOutCheckout"],
};

const analyses = [
  {
    createdAt: "2026-11-13T15:00:24.598Z",
    finishedAt: "2026-11-13T15:00:24.907Z",
    summary: "El análisis de 1 registros generó 1 hallazgo.",
    selection: ["timedOutCheckout"],
    findings: [timeoutFinding],
  },
  {
    createdAt: "2026-11-13T15:01:29.461Z",
    finishedAt: "2026-11-13T15:01:30.450Z",
    summary: "El análisis de 10 registros generó 2 hallazgos.",
    selection: Object.keys(checkoutLogs),
    findings: [
      timeoutFinding,
      {
        categoryCode: "resource_exhaustion",
        description: "Hay evidencia de que el stock disponible era insuficiente para completar una compra.",
        suggestion: "Revisar la disponibilidad del SKU y sincronizar el stock con el servicio de checkout.",
        evidence: ["outOfStockCheckout"],
      },
    ],
  },
];

const recoveredGateway = "c9533688cd3a4e12b707c070b4f61340";
const poolExhaustion = "ca4d5e36bbf14772aaf8bc4ec4693e1c";
const duplicateCheckout = "945480fe08f445a7bfb31458bd0e6790";
const rejectedCheckout = "b6a939cccdbe4d38a87490de17242d02";
const failedWebhook = "7a1d2103788c4cc1835990c905b00623";
const delayedReceipt = "ba8b9b4992b54c8ba0d4346d24e1d7db";

// UTC events from a second day, with trace IDs shared across related services.
const logs = [
  ["13:41:10.012", "checkout-api", "INFO", "Checkout received method=POST path=/v1/checkout order_id=ord-7021 items=1", recoveredGateway],
  ["13:41:10.044", "inventory-service", "INFO", "Stock reserved order_id=ord-7021 reservation_id=res-9061 sku=SKU-227 quantity=1 duration_ms=17", recoveredGateway],
  ["13:41:10.057", "payment-service", "DEBUG", "Requesting payment authorization order_id=ord-7021 amount_minor=2590 currency=USD attempt=1", recoveredGateway],
  ["13:41:10.131", "payment-service", "WARN", "Payment provider unavailable order_id=ord-7021 upstream_status=502 attempt=1 retry_in_ms=250", recoveredGateway],
  ["13:41:10.381", "payment-service", "DEBUG", "Retrying payment authorization order_id=ord-7021 attempt=2", recoveredGateway],
  ["13:41:10.496", "payment-service", "INFO", "Payment authorized order_id=ord-7021 authorization_id=auth-3081 attempt=2 duration_ms=115", recoveredGateway],
  ["13:41:10.515", "inventory-service", "INFO", "Reservation confirmed order_id=ord-7021 reservation_id=res-9061", recoveredGateway],
  ["13:41:10.532", "checkout-api", "INFO", "Checkout completed order_id=ord-7021 status=201 duration_ms=520", recoveredGateway],

  ["13:43:20.010", "checkout-api", "INFO", "Checkout received method=POST path=/v1/checkout order_id=ord-7022 items=2", poolExhaustion],
  ["13:43:20.036", "inventory-service", "WARN", "Database pool saturated pool=reservations active=20 max=20 waiting=7", poolExhaustion],
  ["13:43:20.537", "inventory-service", "ERROR", "Stock reservation failed after database connection timeout order_id=ord-7022 timeout_ms=500", poolExhaustion],
  ["13:43:20.551", "checkout-api", "ERROR", "Checkout failed because inventory dependency unavailable order_id=ord-7022 status=503 duration_ms=541", poolExhaustion],
  ["13:43:30.134", "inventory-service", "INFO", "Database pool recovered pool=reservations active=6 waiting=0", null],

  ["13:46:12.004", "checkout-api", "INFO", "Checkout received method=POST path=/v1/checkout order_id=ord-7023 items=1", duplicateCheckout],
  ["13:46:12.034", "inventory-service", "INFO", "Stock reserved order_id=ord-7023 reservation_id=res-9063 sku=SKU-184 quantity=1 duration_ms=18", duplicateCheckout],
  ["13:46:12.179", "payment-service", "INFO", "Payment authorized order_id=ord-7023 authorization_id=auth-3083 duration_ms=132", duplicateCheckout],
  ["13:46:12.205", "inventory-service", "INFO", "Reservation confirmed order_id=ord-7023 reservation_id=res-9063", duplicateCheckout],
  ["13:46:12.225", "checkout-api", "INFO", "Checkout completed order_id=ord-7023 status=201 duration_ms=221", duplicateCheckout],
  ["13:46:12.906", "checkout-api", "INFO", "Duplicate checkout returned cached response order_id=ord-7023 status=201 duration_ms=4", duplicateCheckout],

  ["13:48:40.110", "checkout-api", "INFO", "Checkout received method=POST path=/v1/checkout order_id=ord-7024 items=1", rejectedCheckout],
  ["13:48:40.122", "checkout-api", "WARN", "Checkout validation failed order_id=ord-7024 field=items[0].quantity rule=positive_integer", rejectedCheckout],
  ["13:48:40.126", "checkout-api", "INFO", "Checkout rejected order_id=ord-7024 status=422 reason=INVALID_QUANTITY duration_ms=16", rejectedCheckout],

  ["13:51:05.007", "payment-service", "INFO", "Payment webhook received event_id=evt-8412 type=payment.settled", failedWebhook],
  ["13:51:05.020", "payment-service", "WARN", "Payment webhook signature rejected event_id=evt-8412 reason=SIGNATURE_MISMATCH", failedWebhook],
  ["13:51:05.025", "payment-service", "INFO", "Payment webhook rejected event_id=evt-8412 status=401 duration_ms=18", failedWebhook],
  ["13:51:36.074", "payment-service", "INFO", "Settlement batch reconciled job=settlement batch_id=stl-913 processed=24 unmatched=0 duration_ms=574", null],

  ["13:54:20.030", "checkout-api", "INFO", "Checkout received method=POST path=/v1/checkout order_id=ord-7025 items=1", delayedReceipt],
  ["13:54:20.059", "inventory-service", "INFO", "Stock reserved order_id=ord-7025 reservation_id=res-9065 sku=SKU-227 quantity=1 duration_ms=16", delayedReceipt],
  ["13:54:20.184", "payment-service", "INFO", "Payment authorized order_id=ord-7025 authorization_id=auth-3085 duration_ms=118", delayedReceipt],
  ["13:54:20.209", "inventory-service", "INFO", "Reservation confirmed order_id=ord-7025 reservation_id=res-9065", delayedReceipt],
  ["13:54:20.235", "checkout-api", "INFO", "Checkout completed order_id=ord-7025 status=201 duration_ms=205", delayedReceipt],
  ["13:54:20.241", "notification-service", "INFO", "Receipt queued order_id=ord-7025 message_id=msg-2911", delayedReceipt],
  ["13:54:20.446", "notification-service", "WARN", "Email provider unavailable message_id=msg-2911 upstream_status=429 attempt=1 retry_in_ms=1000", delayedReceipt],
  ["13:54:21.562", "notification-service", "INFO", "Receipt accepted by email provider order_id=ord-7025 message_id=msg-2911 attempt=2", delayedReceipt],

  ["13:56:00.016", "inventory-service", "INFO", "Expired reservations cleared job=reservation-sweeper released=2 duration_ms=16", null],
  ["13:56:03.004", "checkout-api", "DEBUG", "Readiness probe passed path=/readyz status=200 duration_ms=4", null],
];

function hasSameLogs(saved, expectedIds) {
  const savedIds = new Set(saved.map(({ id }) => id));
  return savedIds.size === expectedIds.length && expectedIds.every((id) => savedIds.has(id));
}

export const seedDemoData = {
  name: "003-seed-demo-data",
  transactional: true,

  async up(database, transaction) {
    const { Analysis, Finding } = database.models;
    const logIds = new Map();

    for (const [key, [time, message]] of Object.entries(checkoutLogs)) {
      const matches = await database.query(`
        SELECT id FROM logs
        WHERE event_at = ? AND service = 'checkout-api' AND message = ?
        LIMIT 2
      `, {
        replacements: [`2026-11-12 ${time}`, message],
        type: QueryTypes.SELECT,
        transaction,
      });
      if (matches.length !== 1) {
        throw new Error(`Expected exactly one 002 checkout log at 2026-11-12 ${time} UTC.`);
      }
      logIds.set(key, matches[0].id);
    }

    for (const { selection, findings, ...snapshot } of analyses) {
      const selectedIds = selection.map((key) => logIds.get(key));
      const values = { ...snapshot, status: "COMPLETED", provider: "mock", errorCode: null, errorMessage: null };
      const candidates = await Analysis.findAll({
        where: values,
        include: { association: "logs", attributes: ["id"], through: { attributes: [] } },
        transaction,
      });

      let analysis = candidates.find(({ logs }) => hasSameLogs(logs, selectedIds));
      if (!analysis) {
        analysis = await Analysis.create(values, { transaction });
        await analysis.addLogs(selectedIds, { transaction });
      }

      for (const { evidence, ...findingSnapshot } of findings) {
        const evidenceIds = evidence.map((key) => logIds.get(key));
        const findingValues = { ...findingSnapshot, analysisId: analysis.id, createdAt: analysis.finishedAt };
        const existing = await Finding.findAll({
          where: findingValues,
          include: { association: "evidence", attributes: ["id"], through: { attributes: [] } },
          transaction,
        });
        if (existing.some((finding) => hasSameLogs(finding.evidence, evidenceIds))) continue;

        const finding = await Finding.create(findingValues, { transaction });
        await finding.addEvidence(evidenceIds, { transaction });
      }
    }

    const rows = logs.map(([time, ...fields]) => [`2026-11-13 ${time}`, ...fields]);
    await database.query(`
      INSERT INTO logs (event_at, service, level, message, trace_id)
      VALUES ${rows.map(() => "(?, ?, ?, ?, ?)").join(", ")}
    `, { replacements: rows.flat(), transaction });
  },
};
