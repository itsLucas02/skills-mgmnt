# Skills Management

A local-first dashboard for inspecting Codex and AI-agent skills, plugin bundles, and MCP servers on a developer machine.

The app is designed for private local use. It reads local agent configuration and skill files so you can understand what is installed, enabled, disabled by config, or gated behind a parent plugin.

## Features

- Bundle-first view for plugins and their child skills.
- Standalone skill inventory for local `.codex/skills` and `.agents/skills`.
- MCP server inventory from Codex config and plugin manifests.
- Details dialog with local metadata and `SKILL.md` preview.
- Safe external-open action for local inspection in Antigravity, with Windows Explorer fallback.
- Local-only API guard for endpoints that read local files or launch local apps.

## Run Locally

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3020
```

## Security And Privacy

This project intentionally inspects local agent configuration folders. Do not deploy it as a public web app.

The dashboard and its file-reading/external-open APIs reject non-localhost requests. Keep it behind `localhost` for normal use.

Ignored local artifacts include:

- `node_modules/`
- `.next/`
- `.turbo/`
- `.playwright-cli/`
- `output/`
- local `.env*` files
- dev-server logs

## Public Repo Checklist

Before publishing a public GitHub repository:

- Run `git status --short` and review every tracked/untracked file.
- Confirm no `.env`, token, credential, local log, cache, or generated output is tracked.
- Review git commit author metadata if you do not want your personal email in public history.
- Run `npm audit --omit=dev`.

## Scripts

```bash
npm run dev
npm run typecheck
npm run lint
npm run build
```
