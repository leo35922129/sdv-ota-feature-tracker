/**
 * Server-side GitHub backup of the current development version.
 * The browser never receives tokens, remotes, or git credentials.
 */
import { spawn } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { ROOT } from "./feature-edits.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CWD = join(__dirname, "..");

const DENY_PREFIXES = [
  ".env",
  "node_modules/",
  "dist/",
  "build/",
  "data/admin/",
  "data/uploads/",
];

function denyPath(path) {
  const rel = String(path || "").replace(/^\.\//, "");
  return DENY_PREFIXES.some((prefix) => rel === prefix.replace(/\/$/, "") || rel.startsWith(prefix));
}

function githubCommitUrl(remoteUrl, sha) {
  const https = String(remoteUrl || "")
    .replace(/^git@github\.com:/, "https://github.com/")
    .replace(/\.git$/, "");
  if (!sha || !https.includes("github.com/")) return null;
  return `${https}/commit/${sha}`;
}

export function createGitRunner(cwd = DEFAULT_CWD) {
  return function runGit(args, { allowFail = false } = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn("git", args, {
        cwd,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code !== 0 && !allowFail) {
          const err = new Error(stderr.trim() || `git ${args[0]} failed`);
          err.code = "git";
          err.stderr = stderr;
          reject(err);
          return;
        }
        resolve({ code, stdout, stderr });
      });
    });
  };
}

export async function backupCurrentVersion({
  store,
  actor = {},
  runGit = createGitRunner(ROOT),
} = {}) {
  if (!store) throw new Error("history store is required");
  return store.withLock(async () => {
    const doc = store.ensureBaseline();
    const current = doc.events.find((item) => item.id === doc.currentEventId);
    if (!current) {
      return { ok: false, state: "error", message: "No current development version exists." };
    }
    if (current.backupStatus === "backed_up" && current.backupCommitSha) {
      return {
        ok: true,
        state: "already-backed-up",
        event: current,
        commitSha: current.backupCommitSha,
        backupUrl: current.backupUrl,
        message: `Version ${current.versionLabel} is already backed up.`,
      };
    }

    const status = await runGit(["status", "--porcelain"], { allowFail: true });
    if (status.code !== 0) {
      return {
        ok: false,
        state: "unavailable",
        message: "Git is not available in this workspace, so Backup to GitHub cannot run.",
      };
    }

    const changed = status.stdout
      .split("\n")
      .map((line) => line.slice(3).trim())
      .filter(Boolean)
      .filter((path) => !denyPath(path));

    for (const path of changed) {
      await runGit(["add", "--", path], { allowFail: true });
    }
    // Keep the design overlay even if porcelain hid it.
    await runGit(["add", "--", "data/feature-edits.json"], { allowFail: true });

    const staged = await runGit(["diff", "--cached", "--name-only"], { allowFail: true });
    const stagedFiles = (staged.stdout || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((path) => !denyPath(path));

    for (const path of (staged.stdout || "").split("\n").map((line) => line.trim()).filter(Boolean)) {
      if (denyPath(path)) await runGit(["reset", "-q", "--", path], { allowFail: true });
    }

    let sha;
    let createdCommit = false;
    if (stagedFiles.length) {
      try {
        await runGit([
          "commit",
          "-m",
          `chore(backup): save development version ${current.versionLabel}`,
        ]);
        createdCommit = true;
      } catch (err) {
        return {
          ok: false,
          state: "error",
          message: err.message || "Git commit failed. The current version was not marked as backed up.",
        };
      }
    }
    const head = await runGit(["rev-parse", "HEAD"]);
    sha = head.stdout.trim();

    const remotes = await runGit(["remote", "-v"], { allowFail: true });
    const remoteMap = new Map();
    for (const line of (remotes.stdout || "").split("\n")) {
      const match = line.match(/^(\S+)\s+(\S+)\s+\(push\)/);
      if (match) remoteMap.set(match[1], match[2]);
    }
    if (!remoteMap.size) {
      return {
        ok: false,
        state: "unavailable",
        message: "No GitHub remotes are configured on this server.",
      };
    }

    const pushErrors = [];
    let backupUrl = null;
    for (const [name, url] of remoteMap) {
      try {
        await runGit(["push", name, "HEAD"]);
        backupUrl = backupUrl || githubCommitUrl(url, sha);
      } catch (err) {
        pushErrors.push(`${name}: ${err.message}`);
      }
    }
    if (pushErrors.length === remoteMap.size) {
      return {
        ok: false,
        state: "error",
        message: `GitHub push failed. ${pushErrors.join(" ")}`,
        commitSha: createdCommit ? sha : null,
      };
    }

    const updated = store.updateEvent(current.id, {
      backupStatus: "backed_up",
      backupCommitSha: sha,
      backupUrl,
    });
    store.recordEvent({
      actorType: "user",
      actorId: actor?.actorId || actor?.email || actor?.actorName || "admin",
      actorName: actor?.actorName || actor?.email || "admin",
      source: "github_backup",
      actionType: "github_backup",
      title: `Backed up ${current.versionLabel}`,
      summary: createdCommit
        ? `Saved development version ${current.versionLabel} to GitHub.`
        : `Working tree was already clean; marked ${current.versionLabel} as backed up at ${sha.slice(0, 7)}.`,
      changedAreas: stagedFiles.length ? stagedFiles : ["git HEAD"],
      snapshot: store.captureDesignSnapshot(),
      undoable: false,
      backupStatus: "backed_up",
      backupCommitSha: sha,
      backupUrl,
    });

    return {
      ok: true,
      state: createdCommit ? "success" : "already-backed-up",
      event: updated,
      commitSha: sha,
      backupUrl,
      message: createdCommit
        ? `Saved ${current.versionLabel} to GitHub.`
        : `Version ${current.versionLabel} is already on GitHub.`,
    };
  });
}
