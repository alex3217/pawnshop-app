import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("Buyer Tools exposes profile and messaging settings through a protected buyer route", async () => {
  const [navigation, app, page] = await Promise.all([source("src/navigation/buyerNavigation.ts"), source("src/App.tsx"), source("src/pages/BuyerMessagingProfilePage.tsx")]);
  assert.match(navigation, /Profile & messaging settings/); assert.match(app, /BuyerMessagingProfilePage/);
  for (const label of ["Public display name", "PawnLoop public handle", "Private contact details", "never public or searchable", "Allow pawnshops to find me", "Allow pawnshops to message me first", "Allow transactional messages", "Blocked pawnshops"]) assert.ok(page.includes(label), label);
});

test("buyer inbox exposes lifecycle filters, context, privacy, settings, and shop discovery", async () => {
  const page = await source("src/pages/MessagesPage.tsx");
  for (const label of ["Open", "Closed", "Unread", "Blocked", "Archived", "New Message", "Settings", "email and phone are never shown", "conversation-context"]) assert.ok(page.includes(label), label);
});

test("owner compose requires a selected privacy-safe recipient", async () => {
  const page = await source("src/pages/MessagesPage.tsx");
  assert.match(page, /disabled=\{sending \|\| !recipient/);
  assert.match(page, /Public name or platform identifier/);
  assert.doesNotMatch(page, /placeholder="[^"]*(email|phone)/i);
});

test("messaging views clear stale tenant data and paginate conversation history", async () => {
  const [messages, conversation, service] = await Promise.all([source("src/pages/MessagesPage.tsx"), source("src/pages/ConversationPage.tsx"), source("src/services/shopMessaging.ts")]);
  assert.match(messages, /setRows\(\[\]\); setLoading\(true\)/);
  assert.match(messages, /shopMode && !shopId/);
  assert.match(messages, /!controller\.signal\.aborted/);
  assert.match(conversation, /setRow\(null\); setLoading\(true\)/);
  assert.match(conversation, /Load older messages/);
  assert.match(service, /messagePage/);
});
