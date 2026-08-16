import { pathToFileURL } from "node:url";

export function classifyMigrationState({ started, finishedExit, outcome, statusClean }) {
  if (!started) return "migration_never_started";
  if (finishedExit === 0 && outcome === "success" && statusClean === true) return "migration_succeeded_clean";
  if (Number.isInteger(finishedExit) && finishedExit !== 0 && outcome === "failure") return "migration_command_failed";
  return "migration_state_unknown";
}

function main() {
  const finished = process.env.MIGRATION_FINISHED_EXIT;
  const state = classifyMigrationState({ started: process.env.MIGRATION_STARTED === "true", finishedExit: /^\d+$/.test(finished || "") ? Number(finished) : null, outcome: process.env.MIGRATION_OUTCOME || "", statusClean: process.env.MIGRATION_STATUS_CLEAN === "true" });
  process.stdout.write(`${state}\n`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
