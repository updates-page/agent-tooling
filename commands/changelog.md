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
last_tag=$(git describe --tags --abbrev=0 2>/dev/null)
if [ -n "$last_tag" ]; then
  git log --oneline "$last_tag"..HEAD
else
  git log --oneline -30
fi
```

The fallback is not optional. In a repo with no tags — a new project, or a
shallow CI clone fetched without them — `git describe` exits 128 and prints
nothing, so `"$(...)"..HEAD` collapses to `..HEAD`, which git reads as
`HEAD..HEAD`. That is an empty range and a **zero exit code**: the log looks
like it ran and found no commits. Concluding "nothing shipped" there is wrong
and silent.

Then follow the `updates-page` skill, which is the authority on the CLI, the
draft-first rule and the content format. In short:

1. `updates whoami` to confirm auth; `updates login --device` if it fails.
2. Group the work into user-visible changes. Drop anything a customer cannot
   see — internal refactors, dependency bumps, test changes.
3. Write the body as an **HTML fragment**, not Markdown. Markdown does not
   fail, it publishes literally onto a live public page.
4. `updates draft --title … --content …` and show the user the post id and the
   body you wrote.
5. Publish only if the user asked for it to go live now — `updates publish <id>`.
   Publishing reaches the public page, the RSS feed and every embedded widget
   at once, and there is no unsend.

Report back with the post id, the title, and the exact command to publish it.
