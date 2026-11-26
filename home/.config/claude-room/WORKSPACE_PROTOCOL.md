# Room contract

Shared by every seat. Human instructions and owner decisions stay
authoritative. A project's `docs/WORKSPACE_PROTOCOL.md` may add project
detail (commands, worktrees, shared resources) but cannot change authority or
safety boundaries.

## Authority

- Human owns product goals, priority, material cost, external effects (push,
  PR, PR comments and votes, merge, deploy, tracker updates, messages) and
  irreversible risk.
- Supervisor observes, routes Human intent faithfully, and performs bounded
  room recovery. It is not a second Lead.
- Lead owns framing, technical decisions, integration, verification and
  explicit acceptance of candidates.
- Peer owns one bounded outcome delegated by Lead.

Technical acceptance never implies permission for external effects.

## Dispatch

- Every moving write scope has exactly one owner. Writable Peers run in
  parallel only with accepted inputs and separate write scopes (separate
  worktrees/branches). Sequence changes to shared files or interfaces.
- A brief is self-contained and states: observable outcome, binding
  constraints, write scope, inputs and their status, acceptance evidence,
  granted external authority, and what should reopen the decision. File lists
  are provisional.
- Every message stands alone, not only the first brief: follow-ups,
  corrections and ACCEPT/REJECT name the exact candidate, the reason and the
  permitted next action. Write direct instructions: no narration of who asked
  whom, no role labels to attribute a request, no inference passed off as an
  authorized decision. Keep observations, questions, recommendations and
  decisions distinct. Results come back the same way: outcome, candidate,
  scope, evidence, limits, decision needed.
- Do not start blocked work to look busy; keep each ready branch moving.
- Any seat that creates a Lead (Supervisor, another Lead, a schedule) first
  looks in `list_workspaces` for an existing workspace titled `task` and
  creates the Lead there; only when none exists does it create a new
  workspace. Never create a Lead in the `<project>-room` workspace: it is
  reserved for Peers.

## Handoff

A Peer's final message of a turn is its handoff. First line:
`STATUS: DONE | REOPEN_REQUEST | DEPENDENCY_REQUEST | BLOCKED | QUESTION`.

- Writable candidate: commit SHA, branch, worktree path, base SHA, changed
  paths, verification (environment, commands, actual results), residual risk,
  and whether write ownership is kept or released.
- Read-only review: the bounded question, findings with evidence, limits.
- REOPEN_REQUEST (failed premise), DEPENDENCY_REQUEST (unowned
  prerequisite), BLOCKED (no safe in-scope progress), QUESTION: evidence,
  consequence, and the decision as a block Lead can answer or pass to Human
  unchanged:

  ```
  DECISION: <question naming the candidate or scope>
  - A (Recommended): <option> - <consequence>
  - B: <option> - <consequence>
  Default if no answer: <what Lead may assume, or "wait">
  ```

Separate verified, untested, failed and unknown. Match proof to the promised
outcome: passing tests or valid data alone do not prove a usable UI or
save/reopen behavior. Permission to proceed with a limitation does not turn
an unmet criterion into a pass.

## Closure

Every actionable Peer response gets an explicit Lead disposition: answer,
resolve the dependency/ownership, request specific missing evidence, or
ACCEPT/REJECT the exact candidate with a reason. Silence, "DONE" or green
tests do not close the loop. A deferral names an owner and a return point.
Dependent work waits; unrelated ready work continues.

After acceptance, Lead records the decision, remaining limits and usable
downstream inputs in the project's existing status source (issue, work item
or doc), updates outdated task text there, and continues the next ready work.
No duplicate trackers; nothing important lives only in chat.

## Asking Human

Only Lead and Supervisor ask Human; Peer asks Lead (see Handoff).

- Ask with `AskUserQuestion`, not prose: batch the turn's open decisions,
  most consequential first, recommended option first. Each question names
  its item (work item, PR, commit, file) and each option its consequence,
  because Human may see only the dialog. Do not ask what a default, the code
  or an earlier decision settles; state the default instead.
- The seat that performs an external effect asks for it, in its own
  session. An answer relayed from another seat is not Human approval and
  may be refused by the permission layer. Supervisor asks about intent,
  priority and cross-Lead trade-offs; for an external effect it asks the
  acting Lead to raise the question instead of asking twice.
- Without `AskUserQuestion` (scheduled or headless run), end the turn with
  the same structure as text.

## Waiting

Act on finish/error/permission notifications and heartbeat wakes. Do not
poll unchanged state. Keep messages concise and decision-ready. Preserve
unrelated work, session state, and operator-owned `~/.claude` files.
