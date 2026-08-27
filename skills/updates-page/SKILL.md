---
name: updates-page
description: Publish, update, schedule and list changelog entries on updates.page using the `updates` CLI. Use this whenever the user wants to publish or draft a changelog entry or release notes, announce a shipped feature or product update, turn a diff, PR or commit range into changelog copy, schedule an announcement for later, or wire changelog publishing into a release script or CI job. Trigger on the intent even when updates.page is not named by the user — "ship the changelog", "write release notes for this", "announce this release", "let customers know what changed" — because a project with this skill installed publishes its changelog to updates.page.
license: MIT
allowed-tools: [Bash, Read]
metadata:
  cli-package: "@updatespage/cli"
  cli-version: ">=1.4.0"
  docs: "https://docs.updates.page"
---

# updates.page

Publish customer-facing changelog entries from a terminal or an agent session.

A changelog entry is an artifact of the release pipeline, not a marketing task —
the thing that shipped the code should be the thing that announces it. That is
what this skill is for.

Everything here runs through the `updates` CLI. Install it if it is missing:

```bash
npm install -g @updatespage/cli
```

## Before anything else: check auth

```bash
updates whoami
```

If that succeeds it prints the signed-in account and you can proceed. If it
exits non-zero, sign in:

```bash
updates login
```

`login` opens a browser. On a machine without one — SSH, a container, CI — it
detects that and prints a short code to enter from another device instead, so
it works headless without any extra flag.

For unattended runs, set `UPDATESPAGE_TOKEN` in the environment instead. Never
pass a token as a command-line argument: it lands in the shell history and in
the process list where other users on the box can read it. If you need to hand
one over from a file, `updates login --token - < token.txt` reads it from stdin.

API access is included for the first 14 days of a new account and continues on
the Pro plan. If auth fails with a message about API access rather than about
credentials, the account's trial has lapsed — the fix is upgrading, not signing
in again. Say so and stop rather than retrying `login` in a loop.

## Draft first, publish second

**Default to creating a draft and showing the user what you wrote.** Publishing
sends the entry to that account's entire audience at once — the public
changelog page, the RSS feed every subscriber reads, and the widget embedded in
their product. `updates unpublish` reverts the post, but everyone who already
saw it has seen it. There is no unsend.

Publish directly when the instruction is unambiguous about going live now:
"publish the 2.1 release notes", "ship the changelog for this PR", "announce
this now".

Draft when any of these are true, which covers most requests:

- The user asked you to *write* something — "draft release notes for…", "what
  should the changelog say about…"
- You generated the content yourself from a diff, a commit range or a PR
  description, and the user has not read it yet
- You had to invent or guess any detail — a version number, a date, what a
  change means for the reader

The asymmetry is the whole reason for the rule. A draft the user has to publish
costs them one command. A publish they did not want costs them a correction to
their customers.

```bash
# Draft, then show the user the id and the body you wrote
updates draft --title "Dark mode" --content "<p>It is here.</p>"

# They approve; publish the existing draft by id
updates publish 123
```

## Content is HTML, not Markdown

`--content` takes an HTML fragment. This is the mistake worth going slowly
over: passing Markdown does not fail, it publishes literally, so the customer's
changelog shows `**Dark mode**` and `- item` as raw characters on a live public
page.

Use `<p>`, `<ul>`/`<li>`, `<strong>`, `<em>`, `<a href>`, `<code>`, `<h2>`.
Plain text works too and renders as an unstyled paragraph.

For anything longer than a sentence, write the HTML to a file and pass it in —
this avoids fighting shell quoting with nested quotes and newlines:

```bash
cat > /tmp/entry.html <<'HTML'
<p>Dark mode is available in Settings, and follows your OS by default.</p>
<ul>
  <li>Respects <code>prefers-color-scheme</code></li>
  <li>Per-device, so your phone and laptop can differ</li>
</ul>
HTML

updates draft --title "Dark mode" --content "$(cat /tmp/entry.html)"
```

## The commands

| Command | What it does |
|---|---|
| `updates draft` | Create a post without publishing it |
| `updates publish [id]` | Publish a draft by id, or create and publish in one step |
| `updates update <id>` | Change fields on an existing post |
| `updates unpublish <id>` | Revert a published or scheduled post to a draft |
| `updates delete <id>` | Delete permanently |
| `updates list` | List posts; `--status draft\|scheduled\|published` |
| `updates get <id>` | Show one post in full |
| `updates categories` | List categories; also `create`, `update`, `delete` |
| `updates upload <file>` | Upload an image, print its public URL |
| `updates whoami` / `login` / `logout` | Auth |
| `updates doctor` | Show the resolved setup and where each value came from |

`draft`, `publish` and `update` share these fields: `--title`, `--content`,
`--summary`, `--category-id`, `--url` (link the entry to an external page
instead), `--private`/`--public`, `--cover-image <path>`.

Run `updates <command> --help` for the exact current flags rather than assuming
this table is exhaustive — it is a summary, and the CLI is the authority.

## Scheduling

```bash
updates publish 123 --at 2026-09-01T09:00:00Z
```

`--at` takes ISO 8601 and is parsed strictly: an impossible date like
`2026-02-30` is rejected rather than quietly becoming March 2, and a time
falling in a daylight-saving gap is an error rather than a silent hour's shift.
A value with no timezone is read as local time — pass an explicit `Z` or offset
when it matters, which in CI it always does.

## Scripting and CI

Every command takes `--json`, which puts structured data on stdout and sends
progress, warnings and prompts to stderr. Parse the JSON; do not scrape the
human-readable output.

```bash
updates list --status draft --json | jq -r '.posts[].id'
updates upload shot.png --json | jq -r .url
```

Under `--json`, a failure is JSON on stdout too:

```json
{ "ok": false, "error": { "code": "auth.not_signed_in", "message": "…", "hint": "Run `updates login`." } }
```

`delete` prompts for confirmation when a terminal is attached and goes straight
through otherwise. In an unattended context that means a mistaken delete has
nothing to catch it, so confirm destructive operations with the user yourself
before running them.

## What the exit codes mean

Read the code before deciding what to do next — they distinguish problems you
can fix from ones only the user can.

| Code | Meaning | What to do |
|---:|---|---|
| `0` | Success | — |
| `2` | Usage: unknown flag, missing argument, bad value | You got the command wrong. Check `--help`; do not retry unchanged. |
| `3` | Configuration problem | Run `updates doctor` — it shows each resolved value and its source. |
| `4` | Not signed in, or the token was rejected | Run `updates login`. If the message names API access, it is an entitlement problem — tell the user, do not retry. |
| `5` | Network failure or server error | Transient. Retry once or twice with a pause. |
| `6` | The thing you named does not exist | Do not create a replacement. Check the id with `updates list`. |
| `7` | Exists, but is in the wrong state for this operation | E.g. publishing something already published. Read the current state first. |
| `130` | Cancelled | The user interrupted. Stop. |

One failure mode is worth naming because a retry makes it worse: if
`--cover-image` fails, the post **exists as an unpublished draft** and the error
carries its id. Retry against that id — `updates update <id>
--cover-image <path>` — rather than re-running the create, which produces a
second post.

## Writing the entry

The reader is a customer of the product, not a contributor to it. That changes
what belongs in the entry.

- **Lead with what changed for them.** "Exports now include custom fields", not
  "Refactored the serializer to support field injection".
- **One entry per user-visible change**, not one per commit. A release with
  fourteen commits and two visible changes is two entries, or one entry with
  two bullets.
- **Leave out what they cannot see.** Internal refactors, dependency bumps and
  test changes do not belong on a customer changelog unless behaviour moved.
- **Be specific and drop the adjectives.** "Faster" is worth nothing; "search
  returns in under 200ms on accounts with 10k posts" is worth reading. If you
  do not have the number, describe the change instead of reaching for a
  superlative.
- **Link to the docs** when behaviour changed or something new needs
  explaining.
- **Say if it breaks something,** what to do about it, and by when.

Keep `--summary` to one sentence: it is what shows in the feed and the embedded
widget, so it carries the entry for readers who never click through.

### Drafting from a diff

The common case is turning work that just landed into an entry. Read the
change, then write for the reader rather than transcribing the log:

```bash
git log --oneline v1.4.0..HEAD
git diff v1.4.0..HEAD --stat
```

Group the commits into user-visible changes, drop anything internal, and draft.
Then show the user the draft body and the post id, and let them decide whether
it goes out. Do not publish a diff-derived entry without the user reading it —
you are inferring intent from code, and the place that gets discovered is the
customer's changelog.