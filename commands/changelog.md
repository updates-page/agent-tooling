---
description: Draft or publish a changelog entry on updates.page
argument-hint: [what shipped, or a git ref range]
allowed-tools: Bash, Read
---

Write a customer-facing changelog entry for updates.page and, unless told
otherwise, leave it as a draft for the user to approve.

The subject: $ARGUMENTS

If that is empty, work out what shipped from the repository — the commits
since the last tag are the usual answer:

```bash
# A shallow clone can hide both the tag and the commits. Deepen before asking.
if [ "$(git rev-parse --is-shallow-repository)" = "true" ]; then
  git fetch --unshallow --tags 2>/dev/null || git fetch --deepen=200 --tags
fi

# Check again: --deepen can succeed and still leave the tag out of reach.
if [ "$(git rev-parse --is-shallow-repository)" = "true" ]; then
  echo "HISTORY INCOMPLETE — still a shallow clone after deepening" >&2
fi

last_tag=$(git describe --tags --abbrev=0 2>/dev/null)
if [ -n "$last_tag" ]; then
  git log --oneline "$last_tag"..HEAD
else
  git log --oneline
fi
```

The fallback is not optional. In a repo with no tags — a new project, or a
shallow CI clone fetched without them — `git describe` exits 128 and prints
nothing, so `"$(...)"..HEAD` collapses to `..HEAD`, which git reads as
`HEAD..HEAD`. That is an empty range and a **zero exit code**: the log looks
like it ran and found no commits. Concluding "nothing shipped" there is wrong
and silent.

The fallback reads **all** of `HEAD`, with no `-n` cap. With no tag every
commit is by definition "since the last tag", so a cap would drop the earliest
work with nothing to show that it had. If the history is genuinely too long to
read, say so and ask for a range — do not summarise the tail you happened to
get.

The shallow check comes first because a partial clone fails the same way while
looking healthy. `actions/checkout` fetches depth-1 without tags by default, so
in CI `git describe` finds no tag *and* `git log` shows a single commit — a
complete-looking answer to the wrong question. If the repository is still
shallow after that fetch, say the history is incomplete rather than writing an
entry from the fragment — that is what the second check prints. `--deepen=200`
is a fallback for servers that refuse `--unshallow`, and it can succeed while
the tag you needed still sits beyond the boundary, so the check has to run
after both attempts rather than instead of them.

Then follow the `updates-page` skill, which is the authority on the CLI, the
draft-first rule and the content format. In short:

1. `updates whoami` to confirm auth; `updates login --device` if it fails.
2. Group the work into user-visible changes. Drop anything a customer cannot
   see — internal refactors, dependency bumps, test changes.
3. Write the body as an **HTML fragment**, not Markdown. Markdown does not
   fail, it publishes literally onto a live public page.
4. `updates draft --title … --content …` and show the user the post id and the
   body you wrote.
5. **Stop there.** Publishing is the user's call, not yours, and being asked
   to "ship the changelog" does not settle it: you wrote this entry from a
   diff, so nobody has read it yet. An instruction to publish is permission
   for the user's words, not for words you inferred from code.

   Publish in this same turn only if the user is approving text they have
   already seen — they asked you to re-run after a correction, or the entry is
   their wording rather than yours. Publishing reaches the public page, the RSS
   feed and every embedded widget at once, and there is no unsend.

Report back with the post id, the title, the body you wrote, and the exact
command to publish it — `updates publish <id>`.
