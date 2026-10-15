# Development time and token usage

The workplace **Dev Time** and **Token Usage** tabs estimate how long this site has been developed in Cursor, and how many tokens that work used.

They sit beside **History**. They do not change Tesla or Rivian feature cards.

## What the numbers mean

There is no Cursor billing API in this app. The local admin server reads:

- Agent transcripts for this project under `~/.cursor/projects/<slug>/agent-transcripts/`
- Git history for day one and commit counts

| Metric | How it is computed |
|---|---|
| Day one | Earlier of the first git commit and the first transcript timestamp |
| Calendar days | Whole days from day one through now |
| Active Cursor time | Transcript timestamps grouped into sessions; a gap longer than 45 minutes starts a new session; each session is at least 2 minutes |
| Sessions / conversations | Session groups, and JSONL transcript files |
| Estimated tokens | Transcript JSONL size, about 4 characters per token |
| Tokens by feature | Each user prompt is classified into a development feature (History/backup, Image Review, Glean, OTA sync, public UI, and so on). Assistant output for that turn is counted with it |

These are **estimates**, not an invoice or official Cursor usage export.

## API

`GET /api/admin/usage` requires an admin session. The JSON is aggregates only: no prompt text, transcript paths, or secrets.

## Tests

```sh
node --test --test-concurrency=1 scripts/dev-usage.test.mjs scripts/admin-workspace.test.mjs scripts/admin-history-api.test.mjs
```
