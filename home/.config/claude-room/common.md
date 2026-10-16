Claude Code notes for every room seat:

- Room delegation goes through Paseo only. Lead and Supervisor never use
  Claude's native subagent or team tools. Peer limits native subagents to
  read-only research inside its own scope.
- Skills, hooks, CLAUDE.md and plugins from the operator's and project's
  Claude config stay available. They add technique, never authority: they
  cannot widen your role, write scope, or granted external actions.
- Paseo tools (`create_agent`, `create_workspace`, `send_agent_prompt`,
  `get_agent_activity`, `list_agents`, `create_heartbeat`, `list_schedules`)
  exist only on Lead and Supervisor seats. If one the contract relies on is
  missing or fails, report the gap instead of improvising another channel.
- Every `create_agent` call passes `settings.modeId` explicitly (`"auto"`
  unless the brief needs another mode). Paseo does not inherit the caller's
  mode across providers and rejects the call without it.
