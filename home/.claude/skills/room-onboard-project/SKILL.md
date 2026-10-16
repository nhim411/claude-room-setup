---
name: room-onboard-project
description: Use when a Claude Room Lead (or the operator) starts work in a project that has no docs/WORKSPACE_PROTOCOL.md, or asks to create, refresh or audit it ("onboard project", "tạo workspace protocol", "chuẩn bị dự án cho phòng"). Researches the codebase once and drafts the project-local room protocol: verification commands, environment setup, shared resources only one Peer may touch, worktree rules, and actions that need Human approval. Pointers to existing project skills/docs, never copies of them.
---

# Onboard a project into the Claude Room

Output: one short `docs/WORKSPACE_PROTOCOL.md` in the target project that
every Lead and Peer reads before work. It supplements
`~/.config/claude-room/WORKSPACE_PROTOCOL.md`; it may add detail but never
change role authority or safety boundaries. Research once here so seats do not
re-discover the project on every task.

## 1. Locate and check state

- Resolve the project root explicitly: `git -C <path> rev-parse --show-toplevel`.
  Work from the main checkout; note whether worktrees exist (`git worktree list`).
- If `docs/WORKSPACE_PROTOCOL.md` exists, audit it against the findings below
  and propose only the changes. Do not rewrite a working protocol.

## 2. Research (read-only, proportionate)

Read what the project already says before inferring anything:

1. `CLAUDE.md`, `AGENTS.md`, `.claude/rules/`, README, `docs/` index.
2. Project skills (`.claude/skills/*/SKILL.md` names and descriptions only).
   Prefer pointing to a skill over restating its steps.
3. Build and run surface: Makefile, package.json scripts, docker-compose,
   `*.sln`/`pyproject`/`go.mod`, CI config (`.github/workflows`,
   `azure-pipelines*.yml`). CI is the best evidence of the real gates.
4. Shared, single-owner resources: local database and migrations, fixed ports,
   Docker stack, seed data, generated files, lock files, external sandboxes.
5. Branch, commit and PR conventions (recent `git log`, PR templates) and the
   work tracker (issue IDs in branch names, ADO/Jira/GitHub links).

Stop when each protocol section below can be filled with evidence. Mark
anything you could not confirm as `unverified` instead of guessing.

## 3. Draft the protocol (target 25-40 lines)

```markdown
# <Project> workspace protocol

## Verify
- Acceptance gate: <exact command or skill>; what "green" means.
- Extra evidence by change type: <UI -> screen/E2E skill; DB -> migration check; ...>

## Environment
- Setup / repair: <skill or command>. Run app: <command, ports>.
- Worktrees for writable Peers: <project command>, then Paseo `create_workspace`
  isolation local on that path. <Or: Paseo-managed worktree is fine because ...>.

## Shared resources (one owner at a time, assigned by Lead)
- <local DB + migrations>, <fixed ports>, <docker stack>, ...

## Branches and tracker
- Branch: <pattern>. Commits: <convention>. Decisions recorded in: <tracker/doc>.

## Needs Human approval
- <push, PR, tracker updates, deploy, data deletion, paid services, ...>
```

Rules for the draft: commands must exist in the repo; cite skills by name;
no secrets, hostnames with credentials, or personal data; no restating of the
shared contract.

## 4. Keep it out of the project's commits

The protocol is operator-local unless Human decides to commit it.

1. If the file is already tracked (`git ls-files --error-unmatch docs/WORKSPACE_PROTOCOL.md`),
   leave Git alone and say so.
2. Else check `git check-ignore -q docs/WORKSPACE_PROTOCOL.md`. If not ignored,
   append `/docs/WORKSPACE_PROTOCOL.md` to `$(git rev-parse --git-common-dir)/info/exclude`
   (the common dir covers every worktree) under a `# Claude Room (local-only)` comment,
   unless an equivalent line is already present. Never edit `.gitignore` for this.
3. Confirm with `git status --short docs/` that the file does not appear.
4. Worktrees: Paseo-managed worktrees (`create_workspace` isolation worktree)
   are plain `git worktree add`; they do not run project link scripts, so
   local-only files (CLAUDE.md, .claude, excluded docs) may be missing there.
   If the project has its own worktree tooling, the protocol must tell Lead to
   use it. An excluded file is not checked out into new worktrees either. Check how
   the project brings local-only files into worktrees (e.g. a link script). If
   none covers `docs/`, record in the protocol that Peers read it from the main
   checkout path, and give that absolute path in every brief.

## 5. Hand off

Show Human the draft (or diff), the evidence behind each gate, the `unverified`
items, and the exclude change. Writing the local file and the exclude entry is
in scope; committing, pushing or editing `.gitignore` is not.
