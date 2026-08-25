import { runProtectedHost } from "./host-runtime.js";

const packageFoundationVersion = "0.0.0";

if (process.argv.includes("--version")) {
  console.log(`spacezero-workspace-host ${packageFoundationVersion}`);
} else {
  runProtectedHost()
    .then(() => {
      process.exitCode = 0;
    })
    .catch(() => {
      console.error("workspace-host failed");
      process.exitCode = 1;
    });
}
