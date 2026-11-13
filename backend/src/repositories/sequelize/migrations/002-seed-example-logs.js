const successfulCheckout = "cbcd72a35d0643b7b183f67dfef045a6";
const recoveredCheckout = "6fd302f0ab554ce8998ae2aee1139d3b";
const timedOutCheckout = "1d42b7d538724fae95c962e3d06cc5db";
const outOfStockCheckout = "a66c05665ed043eb941d2198137bc902";
const declinedCheckout = "4ef7a24c37af4ce1b789838540d2e58a";

// event_at stores UTC with millisecond precision.
const logs = [
  ["2026-11-12 14:02:10.021", "checkout-api", "INFO", "Checkout received method=POST path=/v1/checkout order_id=ord-7012 items=2", successfulCheckout],
  ["2026-11-12 14:02:10.058", "inventory-service", "INFO", "Stock reserved order_id=ord-7012 reservation_id=res-9052 sku=SKU-184 quantity=2 duration_ms=19", successfulCheckout],
  ["2026-11-12 14:02:10.064", "payment-service", "DEBUG", "Requesting payment authorization order_id=ord-7012 amount_minor=6490 currency=USD attempt=1", successfulCheckout],
  ["2026-11-12 14:02:10.192", "payment-service", "INFO", "Payment authorized order_id=ord-7012 authorization_id=auth-3071 duration_ms=128", successfulCheckout],
  ["2026-11-12 14:02:10.211", "inventory-service", "INFO", "Reservation confirmed order_id=ord-7012 reservation_id=res-9052", successfulCheckout],
  ["2026-11-12 14:02:10.230", "checkout-api", "INFO", "Checkout completed order_id=ord-7012 status=201 duration_ms=209", successfulCheckout],

  ["2026-11-12 14:04:33.110", "checkout-api", "INFO", "Checkout received method=POST path=/v1/checkout order_id=ord-7013 items=1", recoveredCheckout],
  ["2026-11-12 14:04:33.148", "inventory-service", "INFO", "Stock reserved order_id=ord-7013 reservation_id=res-9053 sku=SKU-227 quantity=1 duration_ms=22", recoveredCheckout],
  ["2026-11-12 14:04:33.154", "payment-service", "DEBUG", "Requesting payment authorization order_id=ord-7013 amount_minor=2590 currency=USD attempt=1", recoveredCheckout],
  ["2026-11-12 14:04:33.243", "payment-service", "WARN", "Payment provider unavailable order_id=ord-7013 upstream_status=503 attempt=1 retry_in_ms=200", recoveredCheckout],
  ["2026-11-12 14:04:33.443", "payment-service", "DEBUG", "Retrying payment authorization order_id=ord-7013 attempt=2", recoveredCheckout],
  ["2026-11-12 14:04:33.550", "payment-service", "INFO", "Payment authorized order_id=ord-7013 authorization_id=auth-3072 attempt=2 duration_ms=107", recoveredCheckout],
  ["2026-11-12 14:04:33.574", "inventory-service", "INFO", "Reservation confirmed order_id=ord-7013 reservation_id=res-9053", recoveredCheckout],
  ["2026-11-12 14:04:33.591", "checkout-api", "INFO", "Checkout completed order_id=ord-7013 status=201 duration_ms=481", recoveredCheckout],

  ["2026-11-12 14:06:17.002", "checkout-api", "INFO", "Checkout received method=POST path=/v1/checkout order_id=ord-7014 items=1", timedOutCheckout],
  ["2026-11-12 14:06:17.036", "inventory-service", "INFO", "Stock reserved order_id=ord-7014 reservation_id=res-9054 sku=SKU-184 quantity=1 duration_ms=20", timedOutCheckout],
  ["2026-11-12 14:06:17.047", "payment-service", "DEBUG", "Requesting payment authorization order_id=ord-7014 amount_minor=3245 currency=USD attempt=1", timedOutCheckout],
  ["2026-11-12 14:06:17.908", "checkout-api", "INFO", "Checkout received method=POST path=/v1/checkout order_id=ord-7015 items=3", outOfStockCheckout],
  ["2026-11-12 14:06:17.935", "inventory-service", "WARN", "Insufficient stock order_id=ord-7015 sku=SKU-184 requested=3 available=2", outOfStockCheckout],
  ["2026-11-12 14:06:17.945", "checkout-api", "INFO", "Checkout rejected order_id=ord-7015 status=409 reason=OUT_OF_STOCK duration_ms=37", outOfStockCheckout],
  ["2026-11-12 14:06:19.048", "payment-service", "ERROR", "Payment provider connection timeout order_id=ord-7014 code=ETIMEDOUT timeout_ms=2000 duration_ms=2001", timedOutCheckout],
  ["2026-11-12 14:06:19.079", "inventory-service", "INFO", "Stock reservation released order_id=ord-7014 reservation_id=res-9054 reason=PAYMENT_TIMEOUT", timedOutCheckout],
  ["2026-11-12 14:06:19.096", "checkout-api", "ERROR", "Checkout failed after payment timeout order_id=ord-7014 status=504 duration_ms=2094", timedOutCheckout],

  ["2026-11-12 14:08:45.327", "checkout-api", "INFO", "Checkout received method=POST path=/v1/checkout order_id=ord-7016 items=1", declinedCheckout],
  ["2026-11-12 14:08:45.362", "inventory-service", "INFO", "Stock reserved order_id=ord-7016 reservation_id=res-9055 sku=SKU-227 quantity=1 duration_ms=18", declinedCheckout],
  ["2026-11-12 14:08:45.511", "payment-service", "INFO", "Payment declined order_id=ord-7016 reason=INSUFFICIENT_FUNDS duration_ms=140", declinedCheckout],
  ["2026-11-12 14:08:45.540", "inventory-service", "INFO", "Stock reservation released order_id=ord-7016 reservation_id=res-9055 reason=PAYMENT_DECLINED", declinedCheckout],
  ["2026-11-12 14:08:45.558", "checkout-api", "INFO", "Checkout rejected order_id=ord-7016 status=402 reason=PAYMENT_DECLINED duration_ms=231", declinedCheckout],

  ["2026-11-12 14:10:00.014", "inventory-service", "INFO", "Expired reservations cleared job=reservation-sweeper released=4 duration_ms=14", null],
  ["2026-11-12 14:10:02.643", "payment-service", "INFO", "Settlement batch reconciled job=settlement batch_id=stl-912 processed=18 unmatched=0 duration_ms=643", null],
  ["2026-11-12 14:10:03.121", "checkout-api", "DEBUG", "Readiness probe passed path=/readyz status=200 duration_ms=3", null],
];

export const seedExampleLogs = {
  name: "002-seed-example-logs",
  transactional: true,

  async up(database, transaction) {
    await database.query(`
      INSERT INTO logs (event_at, service, level, message, trace_id)
      VALUES ${logs.map(() => "(?, ?, ?, ?, ?)").join(", ")}
    `, { replacements: logs.flat(), transaction });
  },
};
