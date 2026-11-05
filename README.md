# Soul, User, Memory & Skills for DeepSeek Harness

Source-only DSH plugin for a persistent, user-owned identity, a user profile, long-term notes, reusable procedures, and an editor launched from the sidebar or Settings. This tree contains plugin code and synthetic tests, not anyone's actual identity, memories, or private skills.

## Context model

| File under the configured DSH home | Purpose | Agent access through this plugin |
|---|---|---|
| `SOUL.md` | User-owned identity, voice and style | Read-only through `memory`; identity system section at order `-950` |
| `memories/USER.md` | Stable user facts and preferences | Read/add/replace/remove |
| `memories/MEMORY.md` | Durable environment and work facts | Read/add/replace/remove |
| `skills/<name>/SKILL.md` | Reusable procedures | Managed through `evolve`; body loaded on demand by DSH |
| `evolved/` | Skill backups, archive, evidence sidecars and journal | Plugin-managed state; not prompt content |

USER and MEMORY are **required runtime context** (`soul:memory`, order `135`), not identity text. DSH's append-only snapshot model makes writes available at a subsequent context step without rewriting the reusable system prefix. SOUL is placed after harness identity, before the deployment persona; it is not the harness's first section and does not override host policy.

The optional maintenance prompt asks the agent to consolidate durable facts in the same task: replace stale facts rather than append duplicates, remove obsolete entries, and keep within the combined budget. A warning appears above 80% of the memory injection budget; over-budget text is truncated, with a notice. Procedures belong in skills, not growing memory logs.

## Tools and commands

- `memory`: `read`, `add`, `replace`, `remove`; targets `soul`, `user`, `memory`. Writes to `soul` are rejected. Replacement/removal require one exact unambiguous substring.
- `evolve`: `list`, `read`, `create`, `patch`, `verify`, `reference`, `archive`, `audit`. Resources use `references/`, `scripts/` or `assets/` within a bundle.
- `/memory [soul|user|memory|paths]` displays notes or paths.
- `/evolve [status|list|audit|paths|skill <name>]` displays skill state and budgets.

DSH's filesystem skill provider must be enabled separately. It discovers catalog metadata; bodies and resources are loaded when needed. Project-level skills can shadow user-level names. Skill size/line limits, short metadata, resource limits, repetitive/base64-dump checks and some credential-shaped-string rejection reduce context bloat; these are heuristics, not a complete secret scanner. `maintenance: false` and `evolution: false` omit their prompt reminders, not the tools.

**Evidence is self-attested.** Create, patch, reference and verify accept an evidence string of at least 20 trimmed characters. The gate never executes a test, validates a receipt, or establishes that a claimed result is true. A verification sidecar tracks the exact SHA-256 of `SKILL.md`; a changed body invalidates that match. A matching hash is not proof of successful testing, and does not cover all resource contents.

## Sidebar, Settings and theme

The compact pen action in `sidebar.footer.action` opens the global editor. Native Settings provides the same action under **全域 Soul / User / Memory**. Both dispatch `dsh:soul-memory-open`; `shell.overlay` owns the modal. There is **no floating launcher** in Legacy or TG mode. A replacement sidebar must forward the footer action slot.

The editor has Soul/User/Memory tabs, character budgets, Save and Revert, Ctrl/Cmd+S, Escape, and unsaved-change confirmations. Its explicit user edit path may save SOUL even though the agent memory tool cannot. This is an API/tool distinction, not an operating-system ACL protecting SOUL from other tools.

`client.ui-shell.js` loads an optional removable graphite/ice stylesheet. It adapts to host light/dark theme attributes and changes host chrome as well as editor styling. It depends on rc.5 CSS class hashes and client loader/slot APIs; future host versions may change or break these assumptions. Theme-load failure leaves the native theme in place.

## Separate stores: intent and limits

Defaults resolve DSH home from `config.home`, then `DSH_HOME`, then `~/.dsh`. Hermes has its own home and should retain separate identity, memories and skills; this plugin does not automatically import them.

The skill implementation lexically checks configured `skillsDir` and `stateDir` against the configured/resolved Hermes home. These are configuration guards, **not an OS sandbox**, realpath containment, or symlink/junction protection. `Notes` allows configured arbitrary file paths, including absolute `soulFile`, `userFile` and `memoryFile`; it does not apply the skill-root guard to all note paths. Review every configured path and filesystem link yourself.

## HTTP security boundary

The optional host `webServer` service mounts `/soul-memory/api/state`, `/api/file` and `/api/skills`. `GET /api/file?target=...` returns the **full note text**; state/catalog responses also disclose paths and metadata. POST can overwrite any of the three configured notes, including SOUL.

The editor handler has **no independent Origin, Host, authentication or CSRF checks**. JSON content-type and target validation are not authentication. It relies on a correctly secured, trusted DSH host and its transport boundary; that boundary was not independently verified by this publication exercise. Do not expose the handler as a standalone remote service or treat this repository as a safe remote-exposure configuration.

## Persistence limitations

Note writes serialize per instance and use a temporary file plus rename. Editor overwrites attempt bounded previous-version backups; ordinary agent note mutations do not create those editor snapshots. Note backups and journals are best effort and swallow some errors. Skill journals also swallow errors; some backup/cleanup failures propagate. Resource overwrites have no previous-resource backup. Skill bundle creation/replacement, resources and verification-sidecar writes are **not transactional**, and partial failures can leave partial state. Keep independent backups if recovery matters; a successful save does not guarantee a complete audit trail.

## Configuration

The bundle patch names `@local/dsh-soul-memory`. Example row (relative paths avoid machine-specific usernames):

```yaml
- id: soul-memory
  name: '@local/dsh-soul-memory'
  config:
    soulFile: SOUL.md
    userFile: memories/USER.md
    memoryFile: memories/MEMORY.md
    skillsDir: skills
    stateDir: evolved
    maxSoulChars: 8000
    maxMemoryChars: 12000
    maxFileChars: 60000
    maxEntryChars: 2000
    maxBackups: 20
    maintenance: true
    evolution: true
    journal: true
```

Other optional caps: `maxSkillChars` 24000, `maxSkillLines` 500, `maxDescriptionChars` 400, `maxWhenToUseChars` 300, `maxReferenceChars` 120000, `maxReferences` 24, `maxEvidenceChars` 600, `staleAfterDays` 30, `maxBackupSets` 40, `maxJournalBytes` 2000000, `memoryBudget` 12000 (audit threshold). `hermesHome` can explicitly select the lexical boundary; otherwise `HERMES_HOME`, platform local app data, or `~/.hermes` is used. See the source for exact behavior, including validation fallbacks.

## Compatibility and integration

This source targets DSH `0.2.1-rc.5` conventions; it is not a general compatibility guarantee. Host services `systemPrompt`, `tools` and `commands` are required. `webServer` is optional and is bound through the service lifecycle. Client integration needs the DSH module loader, React and slot services supplied by the host; the package declares conversation/sidebar client injections.

Use a compatible host's `plugin_manager` tool with action `install_bundle`, selecting the reviewed local source folder as the bundle source. Follow that host version's actual tool schema; this is not a shell command and no universal argument spelling is assumed. Review configuration and security first. This repository does not claim the plugin is already installed in your profile. No install, profile modification, build, package publication or live reload was performed as part of preparation. `package.json` retains its original `private: true` and local package name; this is not an npm release.

## Tests

Node **>=20.11** is needed for `import.meta.dirname` in the tests (the host may require a newer Node). There are no package dependencies to install for these tests:

```sh
node --test test/client.test.mjs test/command.test.mjs test/editor.test.mjs test/evolve.test.mjs test/index.test.mjs test/skills.test.mjs test/store.test.mjs test/ui-shell.test.mjs
```

Run with temporary-directory environment variables pointing to a disposable, authorized directory outside actual identity/memory stores. `test/index.test.mjs` uses the ambient Hermes boundary, so its temporary skill root must not fall inside that boundary. These tests create synthetic notes/skills and remove their own temporary fixtures.

Tests cover units, HTTP loopback behavior and recording component/slot contracts. They are **not live DSH GUI/browser QA**, visual/accessibility acceptance, real-model skill loading, or verification of the host's security boundary. See `PUBLICATION.md` for the exact staged test result and source-only manifest. No browser test is included.

## Rights

No license has been chosen. This publicly shared source remains all rights reserved pending the owner's explicit licensing decision; public visibility does not grant an open-source license or other permission. No license grant has been invented, and choosing a license is not a blocker to the owner's authorized source upload.
