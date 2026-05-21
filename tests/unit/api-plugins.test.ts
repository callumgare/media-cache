import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock child_process before importing plugin-manager so spawnNpm uses the mock
vi.mock("node:child_process", () => {
  const { EventEmitter } = require("node:events");
  return {
    spawn: vi.fn(),
    execFile: vi.fn(),
  };
});

import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import {
  ensurePluginsDir,
  getInstalledVersion,
  getPluginsDir,
  readPluginsPackageJson,
  spawnNpm,
} from "@@/server/lib/liase/plugin-manager";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let testDir: string;
const origPluginsDir = process.env.PLUGINS_DIR;

beforeEach(async () => {
  testDir = path.join(tmpdir(), `test-plugins-${randomUUID()}`);
  process.env.PLUGINS_DIR = testDir;
  vi.clearAllMocks();
});

afterEach(async () => {
  if (origPluginsDir === undefined) {
    process.env.PLUGINS_DIR = undefined;
  } else {
    process.env.PLUGINS_DIR = origPluginsDir;
  }
  await fs.rm(testDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// getPluginsDir
// ---------------------------------------------------------------------------

describe("getPluginsDir", () => {
  it("returns the PLUGINS_DIR env var when set", () => {
    process.env.PLUGINS_DIR = "/custom/path";
    expect(getPluginsDir()).toBe("/custom/path");
  });

  it("returns a default path under the home directory when env var is unset", () => {
    process.env.PLUGINS_DIR = "";
    const dir = getPluginsDir();
    expect(dir).toContain(".media-cache");
    expect(dir).toContain("plugins");
  });
});

// ---------------------------------------------------------------------------
// ensurePluginsDir
// ---------------------------------------------------------------------------

describe("ensurePluginsDir", () => {
  it("creates the plugins directory if it does not exist", async () => {
    expect(existsSync(testDir)).toBe(false);
    await ensurePluginsDir();
    expect(existsSync(testDir)).toBe(true);
  });

  it("creates a package.json with expected structure", async () => {
    await ensurePluginsDir();
    const pkgPath = path.join(testDir, "package.json");
    expect(existsSync(pkgPath)).toBe(true);
    const pkg = JSON.parse(await fs.readFile(pkgPath, "utf-8")) as Record<
      string,
      unknown
    >;
    expect(pkg.name).toBe("media-cache-plugins");
    expect(pkg.private).toBe(true);
    expect(pkg.type).toBe("module");
    expect(pkg.dependencies).toEqual({});
  });

  it("does not overwrite an existing package.json", async () => {
    await fs.mkdir(testDir, { recursive: true });
    const existing = { name: "custom", dependencies: { foo: "^1.0.0" } };
    await fs.writeFile(
      path.join(testDir, "package.json"),
      JSON.stringify(existing),
    );
    await ensurePluginsDir();
    const pkg = JSON.parse(
      await fs.readFile(path.join(testDir, "package.json"), "utf-8"),
    ) as Record<string, unknown>;
    expect(pkg.name).toBe("custom");
    expect((pkg.dependencies as Record<string, string>)?.foo).toBe("^1.0.0");
  });

  it("is idempotent — calling twice does not throw", async () => {
    await ensurePluginsDir();
    await expect(ensurePluginsDir()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// readPluginsPackageJson
// ---------------------------------------------------------------------------

describe("readPluginsPackageJson", () => {
  it("returns an object with dependencies from the package.json", async () => {
    await fs.mkdir(testDir, { recursive: true });
    await fs.writeFile(
      path.join(testDir, "package.json"),
      JSON.stringify({ dependencies: { "my-plugin": "^2.0.0" } }),
    );
    const pkg = await readPluginsPackageJson();
    expect(pkg.dependencies).toEqual({ "my-plugin": "^2.0.0" });
  });

  it("returns empty object when package.json has no dependencies key", async () => {
    await fs.mkdir(testDir, { recursive: true });
    await fs.writeFile(
      path.join(testDir, "package.json"),
      JSON.stringify({ name: "plugins" }),
    );
    const pkg = await readPluginsPackageJson();
    expect(pkg.dependencies).toBeUndefined();
  });

  it("creates the plugins dir first if it doesn't exist", async () => {
    // testDir doesn't exist yet; readPluginsPackageJson calls ensurePluginsDir
    const pkg = await readPluginsPackageJson();
    expect(pkg.dependencies).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// getInstalledVersion
// ---------------------------------------------------------------------------

describe("getInstalledVersion", () => {
  it("returns the version from node_modules/<name>/package.json", async () => {
    const pkgDir = path.join(testDir, "node_modules", "my-plugin");
    await fs.mkdir(pkgDir, { recursive: true });
    await fs.writeFile(
      path.join(pkgDir, "package.json"),
      JSON.stringify({ version: "1.2.3" }),
    );
    const version = await getInstalledVersion("my-plugin");
    expect(version).toBe("1.2.3");
  });

  it("returns null when the package is not installed", async () => {
    await ensurePluginsDir();
    const version = await getInstalledVersion("not-installed");
    expect(version).toBeNull();
  });

  it("handles scoped packages (e.g. @org/pkg)", async () => {
    const pkgDir = path.join(testDir, "node_modules", "@org", "pkg");
    await fs.mkdir(pkgDir, { recursive: true });
    await fs.writeFile(
      path.join(pkgDir, "package.json"),
      JSON.stringify({ version: "3.0.1" }),
    );
    const version = await getInstalledVersion("@org/pkg");
    expect(version).toBe("3.0.1");
  });
});

// ---------------------------------------------------------------------------
// spawnNpm
// ---------------------------------------------------------------------------

describe("spawnNpm", () => {
  function makeMockProc(exitCode: number, chunks: string[] = []) {
    const proc = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
    };
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    process.nextTick(() => {
      for (const chunk of chunks) {
        proc.stdout.emit("data", Buffer.from(chunk));
      }
      proc.emit("close", exitCode);
    });
    return proc;
  }

  it("resolves when npm exits with code 0", async () => {
    vi.mocked(spawn).mockReturnValue(
      makeMockProc(0) as ReturnType<typeof spawn>,
    );
    await expect(
      spawnNpm(["install", "foo"], testDir, () => {}),
    ).resolves.toBeUndefined();
  });

  it("rejects when npm exits with non-zero code", async () => {
    vi.mocked(spawn).mockReturnValue(
      makeMockProc(1) as ReturnType<typeof spawn>,
    );
    await expect(
      spawnNpm(["install", "bad-pkg"], testDir, () => {}),
    ).rejects.toThrow("npm exited with code 1");
  });

  it("calls onData with stdout chunks", async () => {
    vi.mocked(spawn).mockReturnValue(
      makeMockProc(0, ["line 1\n", "line 2\n"]) as ReturnType<typeof spawn>,
    );
    const received: string[] = [];
    await spawnNpm(["install", "foo"], testDir, (chunk) =>
      received.push(chunk),
    );
    expect(received).toEqual(["line 1\n", "line 2\n"]);
  });

  it("passes the correct args and cwd to spawn", async () => {
    vi.mocked(spawn).mockReturnValue(
      makeMockProc(0) as ReturnType<typeof spawn>,
    );
    await spawnNpm(["install", "foo@1.0.0"], "/my/cwd", () => {});
    expect(vi.mocked(spawn)).toHaveBeenCalledWith(
      "npm",
      ["install", "foo@1.0.0"],
      {
        cwd: "/my/cwd",
      },
    );
  });
});
