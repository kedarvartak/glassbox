import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FsRepoState } from "./repo-state.js";

describe("FsRepoState", () => {
  let dir: string | null = null;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = null;
  });

  it("reports existence, content, and mtime for real files; safe absence otherwise", async () => {
    dir = await mkdtemp(join(tmpdir(), "glassbox-repo-"));
    const file = join(dir, "present.ts");
    await writeFile(file, "export const x = 1;");
    const repo = new FsRepoState();

    expect(await repo.exists(file)).toBe(true);
    expect(await repo.read(file)).toBe("export const x = 1;");
    expect(typeof (await repo.modifiedAt(file))).toBe("number");

    const missing = join(dir, "gone.ts");
    expect(await repo.exists(missing)).toBe(false);
    expect(await repo.read(missing)).toBeNull();
    expect(await repo.modifiedAt(missing)).toBeNull();
  });
});
