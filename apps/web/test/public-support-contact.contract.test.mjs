import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const webRoot = new URL("../", import.meta.url);
const supportEmail = "bealtair1@icloud.com";

test("the shared public support contact is displayed as a mailto footer link", async () => {
  const contact = await readFile(new URL("src/supportContact.ts", webRoot), "utf8");
  const layout = await readFile(new URL("src/components/SiteLayout.tsx", webRoot), "utf8");

  assert.match(contact, new RegExp(`PUBLIC_SUPPORT_EMAIL = "${supportEmail}"`));
  assert.match(contact, /PUBLIC_SUPPORT_MAILTO = `mailto:\$\{PUBLIC_SUPPORT_EMAIL\}`/);
  assert.match(layout, /href=\{PUBLIC_SUPPORT_MAILTO\}/);
  assert.match(layout, /Email support: \{PUBLIC_SUPPORT_EMAIL\}/);
  assert.equal((contact.match(new RegExp(supportEmail, "g")) || []).length, 1);
  assert.doesNotMatch(layout, /support@pawnloop\.com/);
});

test("public support configuration does not alter legal or privacy request contacts", async () => {
  for (const filename of ["TermsPage.tsx", "PrivacyPage.tsx"]) {
    const source = await readFile(new URL(`src/pages/${filename}`, webRoot), "utf8");
    assert.doesNotMatch(source, new RegExp(supportEmail));
    assert.doesNotMatch(source, /PUBLIC_SUPPORT_(?:EMAIL|MAILTO)/);
  }
});
