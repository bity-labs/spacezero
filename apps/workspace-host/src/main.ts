import { Effect } from "effect";
import { runScopedHost } from "./host-runtime.js";

const packageFoundationVersion = "0.0.0";

if (process.argv.includes("--version")) {
  console.log(`spacezero-workspace-host ${packageFoundationVersion}`);
} else {
  Effect.runPromise(runScopedHost).catch((error: unknown) => {
    console.error("workspace-host failed", error);
    process.exitCode = 1;
  });
}
