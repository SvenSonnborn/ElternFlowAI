import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Das Skript wechselt vor jedem Subkommando in seine Repo-Wurzel (`dirname $0/..`).
// Als Kopie unter <tmp>/scripts/ ist das Temp-Verzeichnis die Wurzel: `verdict`
// liest dort startcheck-artifacts/result und nie das Ergebnis eines lokalen
// Laufs im Repo.
let root: string;
let githubOutput: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "startcheck-"));
  mkdirSync(join(root, "scripts"));
  copyFileSync(join(import.meta.dir, "startcheck.sh"), join(root, "scripts", "startcheck.sh"));
  githubOutput = join(root, "github-output");
  writeFileSync(githubOutput, "");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function writeResult(content: string) {
  mkdirSync(join(root, "startcheck-artifacts"));
  writeFileSync(join(root, "startcheck-artifacts", "result"), `${content}\n`);
}

function verdict(...args: string[]) {
  const proc = Bun.spawnSync(["bash", join(root, "scripts", "startcheck.sh"), "verdict", ...args], {
    cwd: root,
    env: { ...process.env, GITHUB_OUTPUT: githubOutput },
  });
  return {
    exitCode: proc.exitCode,
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
    output: readFileSync(githubOutput, "utf8"),
  };
}

describe("startcheck.sh verdict", () => {
  test("ok: grün, und die Marke darf geschrieben werden", () => {
    writeResult("ok");
    const run = verdict("android");
    expect(run.exitCode).toBe(0);
    expect(run.output).toContain("ok=true");
  });

  test("fail: rot mit Fehler-Annotation", () => {
    writeResult("fail");
    const run = verdict("android");
    expect(run.exitCode).toBe(1);
    expect(run.stdout).toContain("::error title=Startcheck::");
    expect(run.stdout).toContain("startcheck-android");
    expect(run.output).not.toContain("ok=true");
  });

  test("keine Ergebnisdatei: grün mit Warnung, aber ohne Marke", () => {
    const run = verdict("android");
    expect(run.exitCode).toBe(0);
    expect(run.stdout).toContain("::warning title=Startcheck::");
    expect(run.output).not.toContain("ok=true");
  });

  test("unbekannter Inhalt zählt als fail", () => {
    writeResult("garbage");
    expect(verdict("android").exitCode).toBe(1);
  });

  test("ohne Plattform: Aufruf-Hinweis, Exit 2", () => {
    const run = verdict();
    expect(run.exitCode).toBe(2);
    expect(run.stderr).toContain("verdict <ios|android>");
  });
});
