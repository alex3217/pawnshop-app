import { loadConfiguredDemoUsers } from "./lib/seed-demo-users.mjs";

process.stdout.write(JSON.stringify(loadConfiguredDemoUsers()));
