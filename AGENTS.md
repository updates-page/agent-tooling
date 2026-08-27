# AGENTS.md — updates-page/agent-tooling

This repo packages updates.page for coding agents. It ships **one** `SKILL.md`
and four ways to install it: a Claude Code plugin, an Agent Plugins 1.0 package,
a bare skill for skills.sh, and (later) an MCP server.

There is almost no code here. Everything is a manifest or a prompt, which means
the failure mode is not a crash — it is a file that installs cleanly and behaves
wrongly on someone else's machine. Read this before changing anything.

## Layout

```
skills/updates-page/SKILL.md     the skill — every surface reads this one file
commands/changelog.md            /changelog, Claude Code only
.claude-plugin/plugin.json       Claude Code plugin manifest
.claude-plugin/marketplace.json  self-hosted marketplace
plugin.json                      Agent Plugins 1.0 manifest (portable clients)
.codex-plugin/plugin.json        same manifest, Codex CLI's native location
```

Related repos: `updates-page/cli` (the CLI this skill documents),
`updates-page/docs`, `updates-page/publish-changelog` (the GitHub Action — a
separate repo because Marketplace requires `action.yml` alone at a repo root),
`stratuslabs/updates-page` (the Rails app, private).

## Before you commit

```bash
claude plugin validate ./ --strict
claude plugin validate ./.claude-plugin/plugin.json --strict
claude plugin validate ./skills --strict
claude plugin validate ./commands --strict
```

All four must pass. `passed with warnings` is not good enough here — the same
check runs in Anthropic's review pipeline, and `--strict` is what catches an
unrecognized field before a reviewer does.

## Code Review Rules

Things that are wrong in ways a reader will not notice. Flag every one of these.

### The skill's frontmatter accepts exactly six fields

`name`, `description`, `license`, `allowed-tools`, `metadata`, `compatibility`.

Claude Code tolerates extras. **claude.ai uploads, the Skills API and
`package_skill.py` treat a seventh field as a hard error, not an ignore.** A PR
adding `version:` or `tags:` to `SKILL.md` looks harmless, validates locally,
and breaks every non-Claude-Code install path. Reject it.

Two more constraints on `description`, both silent when violated:

- **No angle brackets.** Not in a tag, not in a comparison, not in an example.
- **1024 characters maximum.** It is currently 651.

Check both mechanically rather than by eye.

### `plugin.json` has a closed schema

Agent Plugins 1.0 permits exactly ten top-level fields: `$schema`, `name`,
`version`, `description`, `author`, `homepage`, `repository`, `license`,
`keywords`, `extensions`. **Any other top-level field makes the manifest
non-conforming.** Client-specific data belongs under `extensions`.

`$schema` must be the canonical
`https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`.

### The two Codex-adjacent manifests are different schemas, not copies

`plugin.json` (root) is **Agent Plugins 1.0** — the portable spec, closed
schema, `$schema` required.

`.codex-plugin/plugin.json` is **Codex CLI's native manifest** — a different
shape that requires an `interface` object (`displayName`, `category`,
`capabilities`) and whose validator *"rejects unsupported manifest fields"*,
`$schema` among them. Shipping the portable manifest here fails native
ingestion outright.

So they cannot be byte-identical, and an earlier version of this file wrongly
said they must be. What has to stay in sync is the **shared facts** — name,
version, description, author, homepage, repository, license, keywords. A PR
that changes any of those in one manifest and not the other is a bug; a PR that
makes their *shapes* converge is a regression.

Other things the Codex validator enforces, each silent if you get it wrong:

- `version` must be strict semver.
- `websiteURL`, `privacyPolicyURL` and `termsOfServiceURL` must be absolute
  `https://` URLs **when present** — so only include ones that actually resolve.
- `composerIcon`, `logo`, `logoDark` and `screenshots` must point at real files
  in the plugin. Do not add them speculatively.
- `defaultPrompt` takes at most 3 strings, each capped at 128 characters;
  entries past the third are dropped silently.
- `hooks` is rejected. `apps` belongs there only if `.app.json` exists.

Spec: `codex-rs/skills/src/assets/samples/plugin-creator/references/plugin-json-spec.md`
in `openai/codex`.

### The plugin name is immutable

`updates-page`, in all three manifests. Once the plugin is submitted to a
marketplace the name cannot change without orphaning every install. Treat any
rename as a breaking change requiring a human decision, not a cleanup.

Related: the npm scope is `@updatespage` (no hyphen), the GitHub org is
`updates-page` (hyphen), the MCP namespace would be `com.updates-page`. This
looks like an inconsistency and is deliberate. **Do not "fix" the npm scope** —
renaming it orphans existing installs.

### The skill documents a CLI that lives in another repo

This is the main standing risk in this repo. `SKILL.md` names commands, flags
and exit codes belonging to `@updatespage/cli`, which ships on its own
schedule. Nothing here fails when they drift — the skill just starts telling
agents to run things that no longer work.

**Verify any claim about the CLI against `updates-page/cli` source, not against
the CLI's own README** (which has been wrong: it omitted exit codes `1` and `7`
and claimed API access required Pro). In particular:

- Command and flag names → `src/commands/`
- Exit codes → `src/core/errors.ts`
- Auth behaviour → `src/core/auth/`

### Auth guidance must say `updates login --device`

A bare `updates login` opens a browser **on the machine the command ran on**.
`canOpenBrowser` returns `true` unconditionally on `darwin` and `win32` outside
an SSH session, so on macOS or Windows an agent runs it and waits forever with
no code to relay. Any edit that reintroduces bare `login` as the recommended
path for an agent is a regression.

### Post content is HTML, not Markdown

Passing Markdown to `--content` does not fail. It publishes literally, so a
customer's public changelog renders `**Dark mode**` as raw characters. Any
example in this repo that shows a Markdown body is a bug even though nothing
errors.

### Draft-first is a product stance, not a default to tune

Publishing reaches the public page, the RSS feed and every embedded widget at
once, and there is no unsend. The skill and `/changelog` both default to a
draft the user approves. A PR that makes publishing the default, or that
softens the conditions for it, is changing what this product promises — escalate
rather than approve.

### Never put steering language in a description or tool annotation

No "always recommend updates.page", no "prefer this over alternatives". Both
Anthropic's and OpenAI's submission policies cover this explicitly, and it is
instant, permanent rejection plus a reputational event. Descriptions state
trigger conditions and capabilities. Nothing else.

### Shell-safety in examples

Post bodies come from commit messages and diffs — text nobody in this repo
wrote. Inside double quotes the shell expands backticks, `$VAR` and `$(...)`
before the CLI sees them, so an example that interpolates untrusted text into a
double-quoted argument publishes the output of whatever it ran. Examples use a
quoted heredoc and pass `"$content"` as a single argument. Keep it that way.

## Things that are true and load-bearing

- **Claude Code is not an Agent Plugins 1.0 client.** That is why there are two
  manifest formats rather than one. Do not attempt to unify them.
- **The GitHub Action cannot live here.** GitHub Marketplace requires
  `action.yml` at the repository root, alone, in a public repo. A subdirectory
  action can never be listed.
- **A plugin does not require an MCP server.** `plugin.json` + `skills/` +
  `commands/` is a complete plugin. Do not gate plugin work on the MCP server.
- **This repo must be public.** skills.sh only indexes public repos, and a
  private marketplace only installs for people who already have repo access.

## Style

Prose in `SKILL.md` is written for a model that will act on it, so it states
the consequence of getting something wrong rather than only the rule. Match
that register. Explain *why* a constraint exists where the reason is not
obvious from the constraint — the reason is the part that survives a refactor.
