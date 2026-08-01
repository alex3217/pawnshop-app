import assert from "node:assert/strict";
import test from "node:test";

import { parseSmtpTimeout } from "../src/services/transactionalEmail.service.js";

test("SMTP timeout parsing uses bounded values and safe defaults", () => {
  assert.equal(parseSmtpTimeout(undefined, 8_000), 8_000);
  assert.equal(parseSmtpTimeout("", 8_000), 8_000);
  assert.equal(parseSmtpTimeout("not-a-number", 8_000), 8_000);
  assert.equal(parseSmtpTimeout("8000ms", 8_000), 8_000);
  assert.equal(parseSmtpTimeout("1.5", 8_000), 8_000);
  assert.equal(parseSmtpTimeout("0", 8_000), 8_000);
  assert.equal(parseSmtpTimeout("-1", 8_000), 8_000);
  assert.equal(parseSmtpTimeout(" 2500 ", 8_000), 2_500);
  assert.equal(parseSmtpTimeout("999999", 8_000), 60_000);
});
