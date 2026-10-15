# Development history

The workplace **History** tab records design-overlay changes and one-click GitHub backups. It does not replace Tesla or Rivian canonical release files.

## Where history events are created

Events are JSON records in `data/admin/dev-history.json` (gitignored, admin-session only). Snapshots live in `data/admin/snapshots/{eventId}.json`.

| Source | Actor | Action | Hook |
|---|---|---|---|
| First History load / first record | system | `design_edit` baseline | `createHistoryStore().ensureBaseline()` |
| Feature-card overlay save | user | `design_edit` | `POST /api/feature-edits` in `scripts/serve.mjs` |
| Image Review decision | user | `image_decision` | `POST /api/admin/image-decision` |
| Tesla/Rivian OTA monitor publish | system | `source_sync` | `scripts/monitor.mjs` after a publishable sync |
| Undo restore | user | `undo` | `POST /api/admin/history/restore` |
| Backup to GitHub | user | `github_backup` | `POST /api/admin/history/backup` |

Duplicate `design_edit` / `image_decision` events with the same snapshot hash as the current version are skipped. Internal renders and polling are not recorded. The History tab shows the full filtered list on one scrollable workplace page, the same way Development Report and Image Review do.

## Snapshots and restore

- The snapshot is the current `data/feature-edits.json` overlay, not `data/releases.json` / `data/rivian-releases.json`.
- Undo restores that overlay through the server, marks the new event current, and **appends** a history row with `source: undo`. Previous rows are never deleted or rewritten.
- Undo is disabled for the current version, for entries without a snapshot, and when a restore or backup is already running (HTTP 409 `busy`).
- If restore fails, the live overlay is left unchanged.

## Backup to GitHub

`Backup to GitHub` is on the workplace toolbar (next to the close button) on Development Report, Image Review, History, Dev Time, and Token Usage. It calls `POST /api/admin/history/backup`. The browser does not run git, receive tokens, or choose a repository/branch.

The server:

1. Locks so a second restore/backup cannot interleave.
2. Backs up the **current** version (client-supplied version/repo/branch/SHA/path values are ignored).
3. Stages tracked project files, excluding `.env*`, `node_modules/`, `dist/`, `build/`, `data/admin/`, and `data/uploads/`.
4. Commits with `chore(backup): save development version <version>` when there is something to commit.
5. Pushes `HEAD` to every configured git remote (`git push <remote> HEAD`). It does not force-push or rewrite history.
6. Treats a version already marked `backed_up` with a commit SHA as idempotent.

### Required GitHub setup

- Run the local admin server (`npm start` → `http://127.0.0.1:5173/`) with an allowlisted admin session.
- The machine running `scripts/serve.mjs` must have git remotes and credentials that can push (SSH agent or git credential helper). Use a private personal remote only (`origin`); do not add employer or shared-org remotes.
- No `GITHUB_TOKEN` is read by the History backup path. Do not put tokens in the client bundle.

If remotes or git are missing, the button reports that GitHub backup is unavailable without exposing secrets.

## Tests

```sh
node --test --test-concurrency=1 scripts/dev-history.test.mjs scripts/admin-workspace.test.mjs scripts/admin-history-api.test.mjs
npm test
```
