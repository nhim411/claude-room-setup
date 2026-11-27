from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
LAUNCHER = ROOT / "home/.local/bin/claude-room"
INSTALLER = ROOT / "install"
CONFIG = ROOT / "home/.config/claude-room"
FAKE_CLAUDE = (
    "#!/usr/bin/env python3\n"
    "import json, os, sys\n"
    "print(json.dumps({'argv': sys.argv[1:], 'role': os.environ.get('CLAUDE_ROOM_ROLE')}))\n"
)


@unittest.skipIf(os.name == "nt", "fake claude binaries are POSIX scripts; see AGENTS.md for the Windows smoke test")
class LauncherTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        fake = Path(self.temporary.name) / "claude"
        fake.write_text(FAKE_CLAUDE)
        fake.chmod(0o755)
        self.env = {**os.environ, "CLAUDE_BIN": str(fake), "CLAUDE_ROOM_CONFIG_HOME": str(CONFIG)}

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def run_launcher(self, *args: str, env: dict | None = None) -> subprocess.CompletedProcess:
        return subprocess.run([sys.executable, str(LAUNCHER), *args],
                              env=env or self.env, capture_output=True, text=True)

    def prompt_of(self, result: subprocess.CompletedProcess) -> str:
        self.assertEqual(result.returncode, 0, result.stderr)
        argv = json.loads(result.stdout)["argv"]
        self.assertEqual(argv.count("--append-system-prompt"), 1)
        return argv[argv.index("--append-system-prompt") + 1]

    def test_role_first_then_paseo_prompt(self) -> None:
        result = self.run_launcher("peer", "--output-format", "stream-json",
                                   "--append-system-prompt", "PASEO TEXT", "--verbose")
        prompt = self.prompt_of(result)
        self.assertTrue(prompt.startswith("Room role: Peer."))
        self.assertIn("Room delegation goes through Paseo only", prompt)
        self.assertIn("# Room contract", prompt)
        self.assertTrue(prompt.endswith("PASEO TEXT"))
        payload = json.loads(result.stdout)
        self.assertEqual(payload["role"], "peer")
        self.assertEqual(payload["argv"][:3], ["--output-format", "stream-json", "--verbose"])

    def test_equals_form_and_missing_paseo_prompt(self) -> None:
        self.assertTrue(self.prompt_of(self.run_launcher("lead", "--append-system-prompt=X")).endswith("\n\nX"))
        self.assertTrue(self.prompt_of(self.run_launcher("supervisor", "-p", "hi")).startswith("Room role: Supervisor."))

    def test_stream_session_injects_role_into_initialize(self) -> None:
        echo = Path(self.temporary.name) / "echo-claude"
        echo.write_text("#!/usr/bin/env python3\nimport sys\nprint(repr(sys.argv[1:]))\n"
                        "for line in sys.stdin:\n    sys.stdout.write(line)\n")
        echo.chmod(0o755)
        initialize = {"type": "control_request", "request_id": "1",
                      "request": {"subtype": "initialize", "appendSystemPrompt": "PASEO TEXT"}}
        user = {"type": "user", "message": {"role": "user", "content": "initialize this"}}
        stdin = json.dumps(initialize) + "\n" + json.dumps(user) + "\n"
        result = subprocess.run(
            [sys.executable, str(LAUNCHER), "lead", "--input-format", "stream-json", "--output-format", "stream-json"],
            env={**self.env, "CLAUDE_BIN": str(echo)}, input=stdin, capture_output=True, text=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        lines = result.stdout.splitlines()
        self.assertNotIn("--append-system-prompt", lines[0])
        prompt = json.loads(lines[1])["request"]["appendSystemPrompt"]
        self.assertTrue(prompt.startswith("Room role: Lead."))
        self.assertIn("# Room contract", prompt)
        self.assertTrue(prompt.endswith("PASEO TEXT"))
        self.assertEqual(json.loads(lines[2]), user)

    def test_launch_policy_trims_supervisor_context(self) -> None:
        args = ["--output-format", "stream-json", "--setting-sources=user,project,local", "-p", "x"]
        supervisor = json.loads(self.run_launcher("supervisor", *args).stdout)["argv"]
        self.assertIn("--setting-sources=project,local", supervisor)
        self.assertNotIn("--setting-sources=user,project,local", supervisor)
        self.assertIn("--strict-mcp-config", supervisor)
        lead = json.loads(self.run_launcher("lead", *args).stdout)["argv"]
        self.assertIn("--setting-sources=user,project,local", lead)
        self.assertNotIn("--strict-mcp-config", lead)
        peer = json.loads(self.run_launcher("peer", *args).stdout)["argv"]
        self.assertNotIn("--strict-mcp-config", peer)

    def settings_values(self, argv: list[str]) -> list[dict]:
        return [json.loads(argv[i + 1]) for i, arg in enumerate(argv) if arg == "--settings"]

    def test_launch_policy_settings_only_for_supervisor(self) -> None:
        args = ["-p", "x"]
        supervisor = json.loads(self.run_launcher("supervisor", *args).stdout)["argv"]
        self.assertEqual(self.settings_values(supervisor), [{"pluginConfigs": {"agents-md@builtin": {
            "options": {"instructionFiles": "claude-md-and-agents-md"}}}}])
        for role in ("lead", "peer"):
            argv = json.loads(self.run_launcher(role, *args).stdout)["argv"]
            self.assertNotIn("--settings", argv)

    def test_launch_policy_settings_merge_with_existing_flag(self) -> None:
        ours = {"pluginConfigs": {"agents-md@builtin": {"options": {"instructionFiles": "claude-md-and-agents-md"}}}}
        file = Path(self.temporary.name) / "paseo.json"
        file.write_text(json.dumps({"model": "m", "pluginConfigs": {"other": {"a": 1}}}))
        inline = json.dumps({"pluginConfigs": {"agents-md@builtin": {"options": {"instructionFiles": "claude-md"}}}})
        for given in (["--settings", str(file)], [f"--settings={file}"]):
            argv = json.loads(self.run_launcher("supervisor", *given, "-p", "x").stdout)["argv"]
            self.assertEqual(argv.count("--settings"), 1)
            self.assertEqual(self.settings_values(argv), [{
                "model": "m",
                "pluginConfigs": {"other": {"a": 1}, **ours["pluginConfigs"]}}])
        # inline JSON from Paseo: ours wins on conflict; two flags collapse to one
        argv = json.loads(self.run_launcher("supervisor", "--settings", inline, "--settings",
                                            '{"x":1}', "-p", "y").stdout)["argv"]
        self.assertEqual(self.settings_values(argv), [{"x": 1, **ours}])
        self.assertEqual(argv.count("--settings"), 1)

    def test_launch_policy_settings_unreadable_existing_flag_is_kept(self) -> None:
        result = self.run_launcher("supervisor", "--settings", "/nonexistent/paseo.json", "-p", "x")
        self.assertEqual(result.returncode, 0, result.stderr)
        argv = json.loads(result.stdout)["argv"]
        self.assertEqual(argv.count("--settings"), 1)
        self.assertIn("/nonexistent/paseo.json", argv)
        self.assertIn("cannot merge existing --settings", result.stderr)

    def test_probes_pass_through_without_role_files(self) -> None:
        env = {**self.env, "CLAUDE_ROOM_CONFIG_HOME": str(Path(self.temporary.name) / "missing")}
        for args in (["--version"], ["auth", "status"], ["-h"]):
            result = self.run_launcher("lead", *args, env=env)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(result.stdout)["argv"], args)

    def test_errors_never_touch_stdout(self) -> None:
        for args in (["review"], ["peer", "--append-system-prompt"], ["peer", "--append-system-prompt-file", "x"]):
            result = self.run_launcher(*args)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(result.stdout, "")


class InstallerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.home = Path(self.temporary.name)
        (self.home / ".paseo").mkdir()
        self.config_path = self.home / ".paseo/config.json"
        self.env = {**os.environ, "CLAUDE_ROOM_TARGET_HOME": str(self.home), "CLAUDE_BIN": "/bin/true"}

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def run_installer(self, *args: str) -> subprocess.CompletedProcess:
        return subprocess.run([sys.executable, str(INSTALLER), *args], env=self.env, capture_output=True, text=True)

    def fake_daemon(self, providers: list[str]) -> None:
        """Put a fake `paseo` on PATH whose `provider ls --json` lists these providers as available."""
        bin_dir = self.home / "fake-bin"
        bin_dir.mkdir(exist_ok=True)
        rows = Path(bin_dir / "rows.json")
        rows.write_text(json.dumps([{"provider": name, "status": "available"} for name in providers]))
        if os.name == "nt":
            (bin_dir / "paseo.cmd").write_text(f'@type "{rows}"\r\n')
        else:
            fake = bin_dir / "paseo"
            fake.write_text(f"#!/bin/sh\ncat '{rows}'\n")
            fake.chmod(0o755)
        self.env["PATH"] = str(bin_dir) + os.pathsep + os.environ.get("PATH", "")

    def backups(self) -> list[Path]:
        return list(self.home.rglob("*.claude-room-*.bak"))

    def test_install_verify_reinstall_uninstall(self) -> None:
        original = {"daemon": {"listen": "127.0.0.1:6768",
                               "agentProfiles": [{"id": "mine", "name": "Mine", "provider": "pi"}]},
                    "agents": {"providers": {"pi": {"enabled": False}}}}
        self.config_path.write_text(json.dumps(original))

        plan = self.run_installer()
        self.assertIn("PLAN_ONLY", plan.stdout)
        self.assertEqual(json.loads(self.config_path.read_text()), original)
        self.assertFalse((self.home / ".local/bin/claude-room").exists())

        self.assertEqual(self.run_installer("--apply").returncode, 0)
        config = json.loads(self.config_path.read_text())
        self.assertEqual(config["daemon"]["listen"], "127.0.0.1:6768")
        self.assertEqual(config["agents"]["providers"]["pi"], {"enabled": False})
        profiles = {profile["id"]: profile for profile in config["daemon"]["agentProfiles"]}
        self.assertEqual(profiles["mine"], {"id": "mine", "name": "Mine", "provider": "pi"})
        self.assertEqual(profiles["claude-room-lead"]["provider"], "claude-lead")
        if os.name != "nt":
            self.assertEqual(self.config_path.stat().st_mode & 0o777, 0o600)
        launcher = str(self.home / ".local/bin/claude-room")
        command = config["agents"]["providers"]["claude-lead"]["command"]
        self.assertEqual(command, [sys.executable, launcher, "lead"] if os.name == "nt" else [launcher, "lead"])
        self.fake_daemon(["claude", "claude-supervisor", "claude-lead", "claude-peer"])
        verified = self.run_installer("--verify")
        self.assertEqual(verified.returncode, 0, verified.stdout)
        self.assertIn("OK    daemon serves claude-peer", verified.stdout)
        self.fake_daemon(["claude", "claude-supervisor"])
        stale = self.run_installer("--verify")
        self.assertNotEqual(stale.returncode, 0)
        self.assertIn("FAIL  daemon serves claude-lead", stale.stdout)
        self.assertIn("paseo daemon reload", stale.stdout)
        offline = self.run_installer("--verify", "--offline")
        self.assertEqual(offline.returncode, 0, offline.stdout)
        self.assertIn("SKIP  live daemon check", offline.stdout)
        self.assertEqual(len(self.backups()), 1)

        again = self.run_installer("--apply")
        self.assertNotIn("backup", again.stdout)
        self.assertEqual(len(self.backups()), 1)

        self.assertEqual(self.run_installer("--uninstall", "--apply").returncode, 0)
        config = json.loads(self.config_path.read_text())
        self.assertFalse(any(name.startswith("claude-") for name in config["agents"]["providers"]))
        self.assertEqual(config["daemon"]["agentProfiles"], original["daemon"]["agentProfiles"])
        self.assertFalse((self.home / ".local/bin/claude-room").exists())

    def test_explicit_false_injection_is_kept_and_reported(self) -> None:
        self.config_path.write_text(json.dumps({"daemon": {"mcp": {"injectIntoAgents": False}}}))
        result = self.run_installer("--apply")
        self.assertIn("WARN", result.stdout)
        self.assertFalse(json.loads(self.config_path.read_text())["daemon"]["mcp"]["injectIntoAgents"])
        self.assertNotEqual(self.run_installer("--verify").returncode, 0)

    def test_invalid_config_aborts_without_writes(self) -> None:
        for content in ("{not json", "[]"):
            self.config_path.write_text(content)
            result = self.run_installer("--apply")
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("nothing was changed", result.stderr)
            self.assertEqual(self.config_path.read_text(), content)
            self.assertFalse((self.home / ".local/bin/claude-room").exists())


class ContractTests(unittest.TestCase):
    def test_providers_and_roles_are_claude_only(self) -> None:
        providers = json.loads((ROOT / "paseo/providers.json").read_text())
        self.assertEqual(sorted(providers), ["claude-lead", "claude-peer", "claude-supervisor"])
        profiles = json.loads((ROOT / "paseo/profiles.json").read_text())
        for profile in profiles:
            models = {model["id"]: model for model in providers[profile["provider"]]["models"]}
            self.assertIn(profile["model"], models)
            thinking = [option["id"] for option in models[profile["model"]].get("thinkingOptions", [])]
            self.assertIn(profile["thinkingOptionId"], thinking)
        supervisor = next(profile for profile in profiles if profile["provider"] == "claude-supervisor")
        self.assertEqual((supervisor["model"], supervisor["thinkingOptionId"]), ("claude-sonnet-5-5", "low"))
        for profile in profiles:
            model = next(m for m in providers[profile["provider"]]["models"] if m.get("isDefault"))
            default = next(o["id"] for o in model["thinkingOptions"] if o.get("isDefault"))
            self.assertEqual((profile["model"], profile["thinkingOptionId"]), (model["id"], default), profile["name"])
        for name, provider in providers.items():
            self.assertEqual(provider["paseoTools"]["enabled"], name != "claude-peer")
            denied = provider.get("disallowedTools", [])
            self.assertEqual("Agent" in denied, name != "claude-peer")
            if name != "claude-supervisor":
                self.assertIn("mcp__claude_ai_Microsoft_365__outlook_send_mail", denied)
                self.assertIn("mcp__claude_ai_Notion__notion-update-page", denied)
                self.assertNotIn("mcp__claude_ai_Notion__notion-search", denied)
            self.assertEqual("AskUserQuestion" in denied, name == "claude-peer")
        room = ROOT / "home/.config/claude-room"
        protocol = " ".join((room / "WORKSPACE_PROTOCOL.md").read_text().split())
        self.assertIn("Only Lead and Supervisor ask Human", protocol)
        self.assertNotIn("The seat that performs an external effect asks", protocol)
        self.assertNotIn("is not Human approval", protocol)
        self.assertIn("Route through an active Supervisor", protocol)
        self.assertIn("provider `claude-supervisor`, status running or idle", protocol)
        self.assertIn("its cwd may be another project", protocol)
        self.assertIn("with `send_agent_prompt`, one `DECISION:` block per question", protocol)
        self.assertIn("it does not also ask in its own tab", protocol)
        self.assertIn("Only when no Supervisor is active does a Lead use its own `AskUserQuestion`", protocol)
        self.assertIn("Human accepts an answer relayed by Supervisor as their own decision", protocol)
        self.assertIn("asks once more with its own `AskUserQuestion`, quoting the relayed answer", protocol)
        self.assertIn("does not re-route the question", protocol)
        self.assertIn("A Peer never asks Human and gets external authority only from its brief", protocol)
        self.assertIn("recurring job", protocol)
        self.assertIn("`list_schedules` and `list_agents`", protocol)
        self.assertIn("do not create a duplicate", protocol)
        self.assertIn("DECISION:", protocol)
        self.assertIn("Ask every open decision before ending the turn", protocol)
        self.assertIn("must not leave one unasked", protocol)
        self.assertIn("Only without `AskUserQuestion`", protocol)
        self.assertIn("DECISION:", (room / "roles/peer.md").read_text())
        self.assertIn("AskUserQuestion", (room / "roles/lead.md").read_text())
        self.assertIn("AskUserQuestion", (room / "roles/supervisor.md").read_text())
        self.assertIn("settings.modeId", (room / "common.md").read_text())
        self.assertIn("settings.modeId", (room / "roles/lead.md").read_text())
        lead = " ".join((room / "roles/lead.md").read_text().split())
        self.assertIn("Sonnet 5.5 high is the default for every kind of Peer work", lead)
        self.assertIn("Size alone", lead)
        self.assertIn("supervisor-notebook.md", (room / "roles/supervisor.md").read_text())
        self.assertIn("Every message stands alone", (room / "WORKSPACE_PROTOCOL.md").read_text())
        self.assertIn("Haiku 5.5", lead)
        self.assertIn("titled `task`", protocol)
        self.assertIn("reserved for Peers", protocol)
        self.assertNotIn("Sub-Leads go", lead)
        self.assertIn("One scope per Lead", lead)
        self.assertIn("verify their work and accept or reject it", lead)
        supervisor = " ".join((room / "roles/supervisor.md").read_text().split())
        self.assertIn("You only supervise", supervisor)
        self.assertIn("create a new Lead for it", supervisor)
        self.assertIn("never retried on the same tier", lead)
        peer_prompt = " ".join((room / "roles/peer.md").read_text().split())
        self.assertIn("Never end a turn while work you started is still in flight", peer_prompt)
        self.assertIn("Every turn ends with a handoff carrying a STATUS first line", peer_prompt)
        self.assertIn("without a `STATUS:` first line is not a handoff", lead)
        self.assertIn("`AskUserQuestion` is disabled for Peer", peer_prompt)
        self.assertIn("Decide technical choices inside your scope and authority yourself", lead)
        self.assertIn("approach, files, tests, Peer split, order of work", lead)
        self.assertIn("Ask Human only for intent, priority, product or business calls", lead)
        self.assertIn("before the turn ends", lead)
        self.assertIn("list_pending_permissions", supervisor)
        self.assertIn("re-ask it in your own `AskUserQuestion`", supervisor)
        self.assertIn("recommended option first", supervisor)
        self.assertIn("respond_to_permission", supervisor)
        self.assertNotIn("tell Human to confirm in that agent's tab", supervisor)
        self.assertNotIn("explicitly accepts answering such approvals", supervisor)
        self.assertNotIn("Do not collect external-effect approvals yourself", supervisor)
        self.assertIn("batch them into one `AskUserQuestion`", supervisor)
        self.assertIn("send Human's answer back verbatim to that Lead with `send_agent_prompt`", supervisor)
        self.assertIn("Human accepts your relayed answer as their own, external effects included", supervisor)
        self.assertIn("check `list_pending_permissions` and agent statuses", supervisor)
        self.assertIn("`*/30 * * * *`", supervisor)
        self.assertIn("on a quiet tick (no checkpoint due) call only `list_pending_permissions`", supervisor)
        self.assertIn("`list_agents` without `includeArchived`", supervisor)
        self.assertIn("Restart this session daily", supervisor)
        self.assertIn("write open items and checkpoints into the notebook first", supervisor)
        self.assertIn("at most 4 Peers per Lead and 8 Peers room-wide", lead)
        self.assertIn("count the running or idle `claude-peer` agents with `list_agents`", lead)
        self.assertIn("queue work beyond the cap", lead)
        self.assertIn("a small T1/T2 change gets one fast review pass", lead)
        self.assertIn("deep and business review only for logic, DB or security changes", lead)
        self.assertIn("The self-review gate is a single pass", lead)
        self.assertIn("run the quality gates once, batched, per PR at the end", lead)
        self.assertIn("the project's timeout-rerun script instead of a full re-run", lead)
        self.assertIn("Above about 150k tokens of context, write a handoff note", lead)
        self.assertIn("no polling loops that hold your context", lead)
        self.assertIn("Above about 150k tokens of context, commit what is verified", peer_prompt)
        self.assertIn("end the turn with `STATUS: BLOCKED` naming what to re-check", peer_prompt)
        self.assertIn("Do not poll in loops that hold context", peer_prompt)
        self.assertIn("(except the verbatim answer to a Lead's `DECISION:` question)", supervisor)
        self.assertIn("`list_agents` without cwd hides agents running in worktrees", supervisor)
        self.assertIn("`create_agent` calls (`get_agent_activity`)", supervisor)
        self.assertIn("`list_agents` with each worktree cwd", supervisor)
        self.assertIn("Human accepts this for every choice, external effects included", supervisor)
        self.assertIn("consumes that agent's finish notification", supervisor)
        self.assertIn("re-check its status and latest message on the next heartbeat", supervisor)
        self.assertIn("accept or reject, and a Peer's technical `DECISION:` block", lead)
        self.assertIn("active Supervisor first, own `AskUserQuestion` otherwise", lead)
        self.assertIn("re-check it with `get_agent_activity`", lead)
        self.assertIn("take that handoff and act on it", lead)
        peer_models = {m["id"] for m in providers["claude-peer"]["models"]}
        self.assertIn("claude-haiku-5-5", peer_models)
        self.assertEqual((ROOT / "CLAUDE.md").read_text().strip(), "@AGENTS.md")
        guide = (ROOT / "AGENTS.md").read_text()
        self.assertIn("only the Lead that pushes last to main runs `./install --apply`, from main", " ".join(guide.split()))
        for command in ("./install --apply", "paseo daemon reload", "./install --verify", "onboard-project.md"):
            self.assertIn(command, guide)
        procedure = "~/.config/claude-room/onboard-project.md"
        self.assertTrue((room / "onboard-project.md").is_file())
        self.assertIn(procedure, (room / "roles/lead.md").read_text())
        skill = ROOT / "home/.claude/skills/room-onboard-project/SKILL.md"
        self.assertIn(procedure, skill.read_text())
        for path in [*ROOT.joinpath("home").rglob("*"), ROOT / "paseo/providers.json"]:
            if path.is_file() and "__pycache__" not in path.parts:
                self.assertNotIn("codex", path.read_text().lower(), path)


if __name__ == "__main__":
    unittest.main()
