#!/usr/bin/env node

import { spawn } from "node:child_process";

const defaultImage = "paretoproof-problem9-devbox:local";
const forwardedArgs = process.argv.slice(2);

if (!forwardedArgs.includes("--image")) {
  forwardedArgs.unshift(defaultImage);
  forwardedArgs.unshift("--image");
}

const bunCommand = process.platform === "win32" ? "bun.exe" : "bun";
const child = spawn(
  bunCommand,
  ["--cwd", "apps/worker", "run:problem9-attempt:trusted-local", "--", ...forwardedArgs],
  {
    stdio: "inherit",
    windowsHide: true
  }
);

child.once("error", (error) => {
  console.error(`Failed to launch trusted-local Problem 9 attempt wrapper: ${error.message}`);
  process.exit(1);
});

child.once("close", (exitCode) => {
  process.exit(exitCode ?? 1);
});
