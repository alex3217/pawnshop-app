import assert from "node:assert/strict";
import test from "node:test";
import {
  findSensitiveFinancialField,
  rejectSensitiveFinancialFields,
} from "../src/middleware/rejectSensitiveFinancialFields.js";

test("finds prohibited card and full bank fields at any nesting depth", () => {
  for (const key of ["cardNumber", "card_number", "cvc", "cvv", "routingNumber", "routing_number", "accountNumber", "account_number"]) {
    assert.equal(findSensitiveFinancialField({ payment: { [key]: "secret" } }), `body.payment.${key}`);
  }
});

test("allows Stripe IDs and masked last-four fields", () => {
  assert.equal(findSensitiveFinancialField({ paymentMethodId: "pm_test", stripeAccountId: "acct_test", last4: "4242", bankName: "Test Bank" }), null);
});

test("rejects without echoing the sensitive field or value", () => {
  const req = { body: { card_number: "4242424242424242" }, requestId: "req_test" };
  let response;
  const res = { status(code) { this.code = code; return this; }, json(body) { response = body; return this; } };
  rejectSensitiveFinancialFields(req, res, () => assert.fail("next should not run"));
  assert.equal(res.code, 400);
  assert.equal(response.code, "SENSITIVE_FINANCIAL_FIELD_REJECTED");
  assert.doesNotMatch(JSON.stringify(response), /4242424242424242|card_number/);
});

