# Agent guidance

Keep PaperSetGPT small, local-first, and safe to run against an ordinary Brave installation.

## Repository invariants

- Keep one ordinary Brave installation; do not fork or rebuild Brave for this project.
- Do not weaken Chromium sandboxing, site isolation, process isolation, updates, or other browser security boundaries to reduce process count.
- Keep the ChatGPT extension narrowly scoped to ChatGPT origins and local extension storage.
- Add no telemetry, analytics, remote service, CDN, or extension-originated network dependency.
- Never copy browser cookies, history, sessions, credentials, account data, profile identifiers, or other personal browser state into the repository.
- Prefer supported Brave settings APIs and reversible browser-native rendering reductions before raw preference edits or DOM mutation.
- Raw Brave preference writes must be allowlisted, performed only while the target user-data root is closed, and must never bypass Chromium protected-preference integrity.
- Treat selectors against ChatGPT's private DOM as compatibility-sensitive. Fail open rather than damaging conversation UI.
- Keep ChatGPT application colours on the native theme path; do not reintroduce component-by-component colour overrides while the native theme system can express the requirement.
- Keep the extension build-free and dependency-free unless a concrete requirement proves otherwise.
- Run npm test and git diff --check before committing.
- Use the isolated qualification profile for browser automation; do not automate or restart a user's active production profile.
- Update docs/architecture.md when runtime boundaries change and docs/setup.md when installation or Brave configuration changes.
