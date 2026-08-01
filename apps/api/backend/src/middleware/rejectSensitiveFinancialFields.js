const SENSITIVE_FINANCIAL_KEYS = new Set([
  "cardnumber",
  "cvc",
  "cvv",
  "routingnumber",
  "accountnumber",
]);

function normalizedKey(value) {
  return String(value || "").replace(/[_-]/g, "").toLowerCase();
}

export function findSensitiveFinancialField(value, path = "body", seen = new WeakSet()) {
  if (!value || typeof value !== "object") return null;
  if (seen.has(value)) return null;
  seen.add(value);

  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (SENSITIVE_FINANCIAL_KEYS.has(normalizedKey(key))) return childPath;
    const nested = findSensitiveFinancialField(child, childPath, seen);
    if (nested) return nested;
  }
  return null;
}

export function rejectSensitiveFinancialFields(req, res, next) {
  const field = findSensitiveFinancialField(req.body);
  if (!field) return next();

  return res.status(400).json({
    success: false,
    error: "Raw card and bank-account details must be submitted directly to Stripe.",
    code: "SENSITIVE_FINANCIAL_FIELD_REJECTED",
    requestId: req.requestId,
  });
}

