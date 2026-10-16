# Agent guide: set up Claude Room

You are an AI coding agent asked to install or update Claude Room from this
repository on the user's machine. Follow these steps in order. Talk to the user
in their language; this file is in English only for precision.

Claude Room adds three Paseo providers (`claude-supervisor`, `claude-lead`,
`claude-peer`) that launch Claude Code with a role prompt. See README.md for
what the roles do.

## Rules

- `./install --apply` changes files outside this repo: `~/.paseo/config.json`,
  `~/.config/claude-room/`, `~/.local/bin/claude-room`,
  `~/.claude/skills/room-onboard-project/`. Show the user the plan from
  `./install` and get an explicit yes before applying.
- Never hand-edit `~/.paseo/config.json`; the installer merges it and keeps a
  backup. Never print tokens or credentials.
- Use `paseo daemon reload`, not a daemon restart: a restart kills running agents.
- Do not commit or push this repository unless the user asks.

## 1. Check prerequisites

Run each check and stop with a clear message if one fails.

| Check | Command | Fix |
| --- | --- | --- |
| Linux, macOS or WSL | `uname -s` | On Windows, install inside the WSL distro the Paseo app connects to |
| Python 3.9+ | `python3 --version` | Install Python 3 |
| Claude Code logged in | `claude --version && claude auth status` | User runs `claude` and logs in |
| Paseo CLI | `paseo --version` | `npm i -g @getpaseo/cli`, or Paseo Desktop |
| Paseo daemon reachable | `paseo daemon status` | If it says not running but the app works, read `daemon.listen` in `~/.paseo/config.json` and add `--host <listen>` to every `paseo` command |
| `~/.local/bin` on PATH | `echo "$PATH" \| tr : '\n' \| grep -x "$HOME/.local/bin"` | Tell the user which shell profile line to add; do not edit it without consent |

## 2. Get the code

If you are not already inside a checkout of this repo:

```bash
git clone https://github.com/nhim411/claude-room-setup.git ~/claude-room-setup
cd ~/claude-room-setup
```

Keep the checkout: updates and uninstall run from it.

## 3. Plan, confirm, install

```bash
./install                 # plan only; prints create/replace/add lines and PLAN_ONLY
```

Summarize the plan for the user (files created or replaced, providers and
profiles added, whether `daemon.mcp.injectIntoAgents` is set). After the user
agrees:

```bash
./install --apply         # backups: *.claude-room-<timestamp>.bak next to each replaced file
paseo daemon reload       # add --host <listen> if needed (step 1)
./install --verify        # must end with VERIFY_OK
```

Any `FAIL` line in `--verify` is a stop: report it with the Troubleshooting
table below instead of continuing.

## 4. Smoke test

```bash
paseo provider ls         # claude-supervisor, claude-lead, claude-peer: available, Enabled
claude-room peer -p "Quote the line starting with 'Room role:' from your instructions, or answer ABSENT."
```

The second command makes one small model request; ask the user first if cost
matters. It must quote `Room role: Peer.`

## 5. Hand off to the user

Tell the user, briefly:

- What changed and where the backups are.
- How to use it: in the Paseo app open a project workspace, create an agent with
  provider **Claude Lead** (or profile **Room Lead**), and give it an outcome,
  not a list of steps.
- **First time in each project, run onboarding** before giving work to Lead:
  `/room-onboard-project`, or ask any agent to follow
  `~/.config/claude-room/onboard-project.md` for that project. It drafts
  `docs/WORKSPACE_PROTOCOL.md`; the user reviews it. Lead also runs it on its own
  when the file is missing.
- Detailed guide (Vietnamese): `docs/huong-dan-su-dung.md`.

## Update and uninstall

```bash
git pull && ./install && ./install --apply && paseo daemon reload && ./install --verify
./install --uninstall            # plan
./install --uninstall --apply    # removes only Claude Room providers, profiles and files
```

New role prompts apply to agents started after the install; running agents keep
the old ones.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `claude-*` providers missing in Paseo | Run `paseo daemon reload`, then `./install --verify` |
| Profiles section empty in the model picker | Same as above; check `daemon.agentProfiles` contains `claude-room-*` |
| `paseo` says daemon not running while the app works | The daemon listens on a non-default address: pass `--host` (step 1) |
| Agent fails at launch | Run `claude-room lead -p "role?"`; ensure `claude` is on PATH or set `CLAUDE_BIN` |
| Lead or Supervisor has no Paseo tools | `daemon.mcp.injectIntoAgents` must be `true` (verify reports it) |
| `create_agent` fails with "cannot inherit mode" | Pass `settings.modeId` (for example `"auto"`); the role prompts already say so |
| Paseo app on Windows shows nothing new | The install must happen inside the WSL host the app connects to, then reload |

## Working on this repository

- `home/` mirrors files installed under `~`; `paseo/*.json` is merged into
  `~/.paseo/config.json` (`@@HOME@@` becomes the user's home).
- Run `make test` after any change. Keep the repo free of private project
  names, internal URLs and personal data: it is public.
