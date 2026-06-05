import { createRequire } from "node:module";

/**
 * `node:sqlite` is the built-in SQLite binding (no native compile step, which
 * keeps Glassbox `npx`-installable — doc 17 §4.5). Two wrinkles, handled here so
 * the rest of the store can just `import { DatabaseSync }`:
 *
 *  1. Node prints a one-time `ExperimentalWarning` the first time `DatabaseSync`
 *     is constructed. That's pure noise in a CLI, so we drop **only** that exact
 *     message (installed before the binding loads) and forward everything else.
 *  2. It's loaded via `createRequire`, not a static `import`, because some
 *     bundlers (e.g. the Vite version under Vitest) don't yet recognize
 *     `node:sqlite` as a builtin and try to resolve a bare `sqlite` module. A
 *     runtime require sidesteps that — Node resolves the real builtin.
 */
type EmitWarning = typeof process.emitWarning;
const forward = process.emitWarning.bind(process) as unknown as (
  warning: string | Error,
  ...rest: unknown[]
) => void;
process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
  const message = typeof warning === "string" ? warning : warning.message;
  if (message.includes("SQLite is an experimental feature")) return;
  forward(warning, ...rest);
}) as EmitWarning;

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");

/** Instance type of the runtime-required `DatabaseSync` class. */
export type Database = InstanceType<typeof DatabaseSync>;
export { DatabaseSync };
