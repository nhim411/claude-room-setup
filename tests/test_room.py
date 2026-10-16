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
        verified = self.run_installer("--verify")
        self.assertEqual(verified.returncode, 0, verified.stdout)
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
            models = [model["id"] for model in providers[profile["provider"]]["models"]]
            self.assertIn(profile["model"], models)
        for name, provider in providers.items():
            self.assertEqual(provider["paseoTools"]["enabled"], name != "claude-peer")
            denied = provider.get("disallowedTools", [])
            self.assertEqual("Agent" in denied, name != "claude-peer")
            if name != "claude-supervisor":
                self.assertIn("mcp__claude_ai_Microsoft_365__outlook_send_mail", denied)
                self.assertIn("mcp__claude_ai_Notion__notion-update-page", denied)
                self.assertNotIn("mcp__claude_ai_Notion__notion-search", denied)
        room = ROOT / "home/.config/claude-room"
        self.assertIn("settings.modeId", (room / "common.md").read_text())
        self.assertIn("settings.modeId", (room / "roles/lead.md").read_text())
        self.assertEqual((ROOT / "CLAUDE.md").read_text().strip(), "@AGENTS.md")
        guide = (ROOT / "AGENTS.md").read_text()
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
