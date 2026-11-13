import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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

// Attrappen für `run`, vorn im PATH: Jede protokolliert ihren Aufruf nach
// $FAKE_DIR/calls. `maestro test` scheitert in den ersten $FAKE_FLOW_FAILS
// Läufen und hält fest, was in dem Moment in startcheck-artifacts/result steht.
// Den Weg „grün nach Wiederholung" erreicht CI nur nach einem echten
// Aussetzer; nachstellen lässt er sich nur hier.
const installFailsHelper = `fake_install_fails() {
  n=$(( $(cat "$FAKE_DIR/installs" 2>/dev/null || echo 0) + 1 ))
  echo "$n" >"$FAKE_DIR/installs"
  [ "$n" -le "\${FAKE_INSTALL_FAILS:-0}" ]
}
`;
const fakes: Record<string, string> = {
  adb: `#!/usr/bin/env bash
echo "adb $*" >>"$FAKE_DIR/calls"
case "$1" in
  install) fake_install_fails && exit 1 ;;
  exec-out) echo png ;;
  logcat) [ "$2" = -d ] && echo log ;;
esac
exit 0
`,
  xcrun: `#!/usr/bin/env bash
echo "xcrun $*" >>"$FAKE_DIR/calls"
case "$2" in
  install) fake_install_fails && exit 1 ;;
  io) echo png >"$5" ;;
  spawn) echo log ;;
esac
exit 0
`,
  maestro: `#!/usr/bin/env bash
echo "maestro $*" >>"$FAKE_DIR/calls"
[ "$1" = test ] || exit 0
cat "$FAKE_DIR/startcheck-artifacts/result" >>"$FAKE_DIR/result-during-flow"
while [ "$#" -gt 0 ]; do
  [ "$1" = --debug-output ] && mkdir -p "$2"
  shift
done
flows=$(( $(cat "$FAKE_DIR/flows" 2>/dev/null || echo 0) + 1 ))
echo "$flows" >"$FAKE_DIR/flows"
[ "$flows" -gt "$FAKE_FLOW_FAILS" ]
`,
};

function artifact(name: string) {
  return join(root, "startcheck-artifacts", name);
}

function runCheck(platform: "android" | "ios", flowFails: number, installFails = 0) {
  const proc = Bun.spawnSync(
    ["bash", join(root, "scripts", "startcheck.sh"), "run", platform, "app.bin"],
    {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${join(root, "bin")}:${process.env.PATH}`,
        // Die iOS-Diagnose kopiert Absturzberichte aus ~/Library; so nur aus dem Temp-Verzeichnis.
        HOME: root,
        FAKE_DIR: root,
        FAKE_FLOW_FAILS: String(flowFails),
        FAKE_INSTALL_FAILS: String(installFails),
        STARTCHECK_SIM_UDID: "SIM-UDID",
      },
    },
  );
  return {
    exitCode: proc.exitCode,
    stdout: proc.stdout.toString(),
    result: readFileSync(artifact("result"), "utf8"),
    calls: readFileSync(join(root, "calls"), "utf8").trimEnd().split("\n"),
  };
}

describe("startcheck.sh run", () => {
  beforeEach(() => {
    mkdirSync(join(root, "bin"));
    for (const [name, script] of Object.entries(fakes)) {
      const body = script.replace("\n", `\n${installFailsHelper}`);
      writeFileSync(join(root, "bin", name), body, { mode: 0o755 });
    }
  });

  test("während des Flows steht fail in result, erst danach ok", () => {
    const run = runCheck("android", 0);
    expect(run.exitCode).toBe(0);
    expect(readFileSync(join(root, "result-during-flow"), "utf8")).toBe("fail\n");
    expect(run.result).toBe("ok\n");
    expect(run.stdout).not.toContain("::warning");
  });

  test("erster Versuch scheitert, zweiter besteht: grün mit Warnung und Diagnose", () => {
    const run = runCheck("android", 1);
    expect(run.exitCode).toBe(0);
    expect(run.result).toBe("ok\n");
    expect(run.stdout).toContain(
      "::warning title=Startcheck::Android: erster Versuch fehlgeschlagen, zweiter läuft",
    );
    expect(existsSync(artifact("device-1.log"))).toBe(true);
    expect(existsSync(artifact("screen-1.png"))).toBe(true);
    expect(existsSync(artifact("device-2.log"))).toBe(false);
    expect(run.calls.filter((call) => call === "adb install -r app.bin")).toHaveLength(2);
  });

  test("beide Versuche scheitern: rot, result bleibt fail", () => {
    const run = runCheck("android", 2);
    expect(run.exitCode).toBe(1);
    expect(run.result).toBe("fail\n");
    expect(existsSync(artifact("device-2.log"))).toBe(true);
    expect(run.calls.filter((call) => call.startsWith("maestro test"))).toHaveLength(2);
  });

  test("Installieren scheitert im ersten Versuch: kein Flow, zweiter Versuch installiert neu", () => {
    const run = runCheck("android", 0, 1);
    expect(run.exitCode).toBe(0);
    expect(run.result).toBe("ok\n");
    expect(run.stdout).toContain(
      "::warning title=Startcheck::Android: erster Versuch fehlgeschlagen",
    );
    const steps = run.calls.filter(
      (call) => call.startsWith("adb install") || call.startsWith("maestro test"),
    );
    expect(steps.map((call) => call.split(" ").slice(0, 2).join(" "))).toEqual([
      "adb install",
      "adb install",
      "maestro test",
    ]);
  });

  test("iOS: zweiter Versuch installiert neu, auf demselben Simulator", () => {
    const run = runCheck("ios", 1);
    expect(run.exitCode).toBe(0);
    expect(run.result).toBe("ok\n");
    expect(existsSync(artifact("screen-1.png"))).toBe(true);
    expect(existsSync(artifact("device-1.log"))).toBe(true);
    expect(
      run.calls.filter((call) => call === "xcrun simctl install SIM-UDID app.bin"),
    ).toHaveLength(2);
    const flows = run.calls.filter((call) => call.startsWith("maestro test"));
    expect(flows).toHaveLength(2);
    for (const flow of flows) expect(flow).toContain("--device SIM-UDID");
  });
});

// install-maestro: Die Prüfsumme muss vor dem Entpacken und vor dem PATH-Eintrag
// greifen. Die `&&`-Kette in fetch_maestro trägt das; als einzelne Zeilen liefe
// sie unter `if` ohne `set -e` einfach weiter.
describe("startcheck.sh install-maestro", () => {
  test("falsche Prüfsumme: Exit ≠ 0, kein unzip, kein PATH-Eintrag", () => {
    const bin = join(root, "bin");
    mkdirSync(bin);
    writeFileSync(
      join(bin, "curl"),
      `#!/usr/bin/env bash
while [ "$#" -gt 0 ]; do
  [ "$1" = -o ] && echo "kein maestro" >"$2"
  shift
done
`,
      { mode: 0o755 },
    );
    writeFileSync(
      join(bin, "unzip"),
      `#!/usr/bin/env bash
echo "unzip $*" >>"$FAKE_DIR/calls"
`,
      { mode: 0o755 },
    );
    const githubPath = join(root, "github-path");
    writeFileSync(githubPath, "");
    const proc = Bun.spawnSync(
      ["bash", join(root, "scripts", "startcheck.sh"), "install-maestro"],
      {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          FAKE_DIR: root,
          RUNNER_TEMP: join(root, "runner-temp"),
          GITHUB_PATH: githubPath,
        },
      },
    );
    expect(proc.exitCode).not.toBe(0);
    expect(existsSync(join(root, "calls"))).toBe(false);
    expect(readFileSync(githubPath, "utf8")).toBe("");
  });
});
