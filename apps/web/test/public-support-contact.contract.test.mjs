import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const webRoot = new URL("../", import.meta.url);
const repositoryRoot = new URL("../../", webRoot);
const contacts = {
  support: "support@pawnloop.com",
  legal: "legal@pawnloop.com",
  security: "security@pawnloop.com",
};

async function readPublicApplicationSources(directory) {
  const files = [];
  const pending = [directory];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of await readdir(current, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        pending.push(new URL(`${entry.name}/`, current));
      } else if (/\.(?:ts|tsx|html)$/.test(entry.name)) {
        files.push(await readFile(new URL(entry.name, current), "utf8"));
      }
    }
  }
  return files.join("\n");
}

test("canonical public business contacts drive accessible footer mailto links", async () => {
  const contact = await readFile(new URL("src/publicBusinessContacts.ts", webRoot), "utf8");
  const layout = await readFile(new URL("src/components/SiteLayout.tsx", webRoot), "utf8");

  for (const [name, email] of Object.entries(contacts)) {
    assert.match(contact, new RegExp(`${name}: "${email.replace(".", "\\.")}"`));
    assert.equal((contact.match(new RegExp(email.replace(".", "\\."), "g")) || []).length, 1);
  }
  assert.match(contact, /PUBLIC_SUPPORT_MAILTO = `mailto:\$\{PUBLIC_SUPPORT_EMAIL\}`/);
  assert.match(contact, /PUBLIC_LEGAL_MAILTO = `mailto:\$\{PUBLIC_LEGAL_EMAIL\}`/);
  assert.match(contact, /PUBLIC_SECURITY_MAILTO = `mailto:\$\{PUBLIC_SECURITY_EMAIL\}`/);
  assert.match(layout, /href=\{PUBLIC_SUPPORT_MAILTO\}/);
  assert.match(layout, /Email customer support: \{PUBLIC_SUPPORT_EMAIL\}/);
  assert.match(layout, /href=\{PUBLIC_SECURITY_MAILTO\}/);
  assert.match(layout, /Report a security issue: \{PUBLIC_SECURITY_EMAIL\}/);
});

test("Terms and Privacy use the canonical legal mailto contact", async () => {
  for (const filename of ["TermsPage.tsx", "PrivacyPage.tsx"]) {
    const source = await readFile(new URL(`src/pages/${filename}`, webRoot), "utf8");
    assert.match(source, /href=\{PUBLIC_LEGAL_MAILTO\}/);
    assert.match(source, /\{PUBLIC_LEGAL_EMAIL\}/);
    assert.match(source, />\s*Email PawnLoop (?:Legal|Legal and Privacy) at \{PUBLIC_LEGAL_EMAIL\}/);
    assert.doesNotMatch(source, /PUBLIC_SUPPORT_(?:EMAIL|MAILTO)/);
  }
});

test("security reporting documentation uses the canonical security mailbox", async () => {
  const security = await readFile(new URL("SECURITY.md", repositoryRoot), "utf8");
  assert.match(security, /\[security@pawnloop\.com\]\(mailto:security@pawnloop\.com\)/);
  assert.doesNotMatch(security, /response (?:within|time)|bug bounty|guarantee/i);
});

test("public application sources do not expose the superseded personal contact", async () => {
  const source = await readPublicApplicationSources(new URL("src/", webRoot));
  assert.doesNotMatch(source, /bealtair1@icloud\.com/i);
});

test("transactional sender and documented Reply-To remain distinct", async () => {
  const example = await readFile(
    new URL("apps/api/backend/.env.example", repositoryRoot),
    "utf8",
  );
  assert.match(
    example,
    /^EMAIL_FROM=PawnLoop <no-reply@notifications\.pawnloop\.com>$/m,
  );
  assert.match(example, /^EMAIL_REPLY_TO=support@pawnloop\.com$/m);
  assert.doesNotMatch(example, /^EMAIL_FROM=.*support@pawnloop\.com$/m);
});
