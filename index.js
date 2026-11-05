/**
 * Soul & Memory for DeepSeek Harness.
 *
 * Gives an agent a persistent self that survives every session, in the spirit
 * of a SOUL.md / USER.md / MEMORY.md assistant:
 *
 *  - `SOUL.md` is the agent's identity and voice. The user owns it; it is
 *    injected as a system-prompt section immediately after the harness
 *    identity, so it also sets the style of every later instruction.
 *  - `memories/USER.md` is the user's profile and stable preferences.
 *  - `memories/MEMORY.md` is the agent's own long-term notebook.
 *
 * USER.md and MEMORY.md are injected as required runtime context, which DSH
 * delivers as an append-only snapshot: a memory write becomes visible on the
 * next step without rewriting the system prefix. The model updates them with
 * the `memory` tool, and a `/memory` command shows the files to the user.
 *
 * The tool definition is authored as plain JSON Schema (the registry's native
 * form) so the bundle needs no package imports beyond Node built-ins.
 *
 * @module @local/dsh-soul-memory
 */
import { memoryCommand } from './command.js'
import { createEditorHandler, ROOT as EDITOR_ROOT } from './editor.js'
import { evolveCommand } from './evolve.js'
import { SkillBook } from './skills.js'
import { Notes } from './store.js'

export const name = 'soul-memory'
export const inject = ['systemPrompt', 'tools', 'commands']

/** Prompt placement: right after the harness identity (-1000), before the persona prefix (0). */
const SOUL_SECTION = { name: 'soul:identity', order: -950 }

/** Runtime-context placement: after subagent delegation (120), before harness source (200). */
const MEMORY_CONTEXT = { name: 'soul:memory', order: 135 }

/** Prompt placement: a late standing reminder, after the Windows shell guidance (1000). */
const MAINTENANCE_SECTION = { name: 'soul:maintenance', order: 1030 }

/** Prompt placement: the skill-evolution contract, just before domain policies. */
const EVOLUTION_SECTION = { name: 'soul:evolution', order: 1035 }

const MEMORY_TOOL_DESCRIPTION =
  'Persist durable facts across sessions. SOUL.md is the user-owned identity; USER.md holds stable facts about the user; MEMORY.md holds your own notes about the environment, projects, and lessons. read returns one file, add appends an entry, replace swaps one exact old_text for content, remove deletes one exact old_text. SOUL.md is read-only for you. Keep entries short and specific; never store credentials or other secrets. Before finishing a task that produced a durable fact, update the relevant file: replace stale entries rather than appending duplicates.'

/**
 * The standing review contract. The tool description says what memory can do;
 * this section says when the agent must maintain it, so a task cannot end with
 * stale notes feeding the next prompt.
 * @param {number} maxChars - combined USER.md + MEMORY.md injection budget.
 * @returns {string} prompt-ready section body.
 */
function maintenanceText(maxChars) {
  return `## Memory maintenance

Treat USER.md and MEMORY.md as durable memory, not a log. Before finishing a task that produced a durable fact — a decision, a working configuration, a corrected assumption — update the affected file in the same task:

- Prefer \`replace\` on the stale entry over \`add\`; do not append a near-duplicate.
- \`remove\` entries that are no longer true.
- Keep USER.md + MEMORY.md within the injected budget (${maxChars} characters). Consolidate overlapping entries before adding more; an over-budget file is truncated and newer entries can fall off.
- A write appears in the next prompt snapshot. Never store credentials or secrets.

This review is part of the task, not an optional extra.`
}

/**
 * The standing self-evolution contract for DSH skills.
 * @param {Record<string, number>} caps - skill caps.
 * @returns {string} prompt-ready section body.
 */
function evolutionText(caps) {
  return `## Self-evolution (DSH)

DSH keeps its own soul, memory, and skills. Hermes files are a separate store: never read, copy, or write them from here.

- Facts → \`memory\` (USER.md/MEMORY.md). Procedures → \`evolve\` (skills). SOUL.md is user-owned: propose a diff, never write it.
- After a task that taught a reusable procedure, or when an existing skill's steps diverged from reality, fix that skill in the same task: test once, then patch it and record the evidence. Do not leave a known-wrong skill for tomorrow.
- Prefer \`patch\` over rewriting; never add unverified steps.
- Anti-bloat: \`SKILL.md\` is an index/procedure (≤ ${caps.maxSkillChars} chars, ≤ ${caps.maxSkillLines} lines). Put long logs, tables, transcripts, and scripts in \`references/\` or \`scripts/\` and point to them. The catalog carries only name + description; a loaded body must stay small.
- Never store secrets. \`evolve\` rejects content that is too large, repetitive, or looks like a dump.`
}

const MEMORY_RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    action: { type: 'string', description: 'The operation that ran.' },
    target: { type: 'string', description: 'The file that was addressed.' },
    path: { type: 'string', description: 'Absolute path of that file.' },
    chars: { type: 'number', description: 'Characters in the file after the operation.' },
    ok: { type: 'boolean', description: 'Whether the operation succeeded.' },
    note: { type: 'string', description: 'Optional guidance, such as a missing file.' },
    content: { type: 'string', description: 'File text, present for read.' },
  },
  required: ['action', 'target', 'path', 'chars', 'ok'],
}

/**
 * Render one memory tool result for the model.
 * @param {Record<string, unknown>} value - canonical tool value.
 * @returns {Array<{ type: 'text', text: string }>} model-facing content.
 */
function renderMemoryResult(value) {
  const lines = [`${value.action} ${value.target} — ${value.path} (${value.chars} chars)`]
  if (typeof value.note === 'string' && value.note.length > 0) lines.push(value.note)
  if (typeof value.content === 'string') lines.push('', value.content.length === 0 ? '(empty)' : value.content)
  return [{ type: 'text', text: lines.join('\n') }]
}

const EVOLVE_TOOL_DESCRIPTION =
  'Manage DSH skills: list, read, create, patch, verify, reference, archive, audit. Skills are procedures, not notes; keep SKILL.md small and move long material to references/ or scripts/. Writes require evidence of a successful test, are backed up, and only touch the DSH skill root — never Hermes.'

const EVOLVE_RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean', description: 'Whether the action succeeded.' },
    action: { type: 'string', description: 'The action that ran.' },
    name: { type: 'string', description: 'Skill name, when the action addressed one.' },
    path: { type: 'string', description: 'Absolute file or directory path.' },
    chars: { type: 'number', description: 'Characters in the written or read file.' },
    lines: { type: 'number', description: 'Lines in the written or read file.' },
    summary: { type: 'string', description: 'One-line human-readable result.' },
    content: { type: 'string', description: 'Skill body, present for read.' },
  },
  required: ['ok', 'action', 'summary'],
}

/**
 * Render one evolve result for the model.
 * @param {Record<string, unknown>} value - canonical tool value.
 * @returns {Array<{ type: 'text', text: string }>} model-facing content.
 */
function renderEvolveResult(value) {
  const lines = [String(value.summary)]
  if (typeof value.content === 'string' && value.content.length > 0) lines.push('', value.content)
  return [{ type: 'text', text: lines.join('\n') }]
}

/**
 * Mount the soul/memory system in one composition.
 * @param {import('@deepseek-ai/cordis').Context} ctx - owning plugin context.
 * @param {Record<string, unknown>} config - row configuration.
 */
export function apply(ctx, config) {
  const options = config ?? {}
  const notes = new Notes(options)
  notes.ensureHome()
  const book = new SkillBook(options)
  book.ensureHome()

  // Web is optional for headless use, but may arrive after this plugin.
  // Bind the editor to the service lifecycle instead of sampling it once.
  ctx.inject(['webServer'], (web) => {
    const handler = createEditorHandler({ notes, book })
    web.effect(() => web.webServer.register({
      kind: 'prefix',
      path: EDITOR_ROOT,
      handler,
    }), 'soul-memory: editor routes')
  })

  ctx.systemPrompt.section({
    name: SOUL_SECTION.name,
    order: SOUL_SECTION.order,
    interpolate: false,
    text: () => notes.promptSoul(),
  })

  ctx.systemPrompt.context({
    name: MEMORY_CONTEXT.name,
    order: MEMORY_CONTEXT.order,
    required: true,
    interpolate: false,
    text: () => notes.promptMemory(),
  })

  if (options.maintenance !== false) {
    ctx.systemPrompt.section({
      name: MAINTENANCE_SECTION.name,
      order: MAINTENANCE_SECTION.order,
      interpolate: false,
      text: () => maintenanceText(notes.maxMemoryChars),
    })
  }

  if (options.evolution !== false) {
    ctx.systemPrompt.section({
      name: EVOLUTION_SECTION.name,
      order: EVOLUTION_SECTION.order,
      interpolate: false,
      text: () => evolutionText({
        maxSkillChars: book.maxSkillChars,
        maxSkillLines: book.maxSkillLines,
      }),
    })
  }

  ctx.tools.register({
    name: 'memory',
    description: MEMORY_TOOL_DESCRIPTION,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: {
          type: 'string',
          enum: ['read', 'add', 'replace', 'remove'],
          description: 'Operation to run.',
        },
        target: {
          type: 'string',
          enum: ['soul', 'user', 'memory'],
          description: 'Which file: soul (SOUL.md, read-only), user (USER.md), or memory (MEMORY.md).',
        },
        content: {
          type: 'string',
          description: 'Entry text for add, or replacement text for replace.',
        },
        old_text: {
          type: 'string',
          description: 'Exact existing substring to replace or remove; required for replace and remove.',
        },
      },
      required: ['action', 'target'],
    },
    output: {
      schema: MEMORY_RESULT_SCHEMA,
      render: (_args, value) => renderMemoryResult(value),
    },
    execute(args) {
      switch (args.action) {
        case 'read':
          return notes.read(args.target)
        case 'add':
          return notes.add(args.target, args.content)
        case 'replace':
          return notes.replace(args.target, args.old_text, args.content)
        case 'remove':
          return notes.remove(args.target, args.old_text)
        default:
          throw new Error(`unknown action ${JSON.stringify(args.action)}; use read, add, replace, or remove`)
      }
    },
  })

  ctx.commands.register({
    name: 'memory',
    description: 'View the SOUL.md, USER.md, and MEMORY.md files',
    input: { hint: '[soul|user|memory|paths]' },
    handler: ({ rawInput }) => memoryCommand(notes, rawInput),
  })

  ctx.tools.register({
    name: 'evolve',
    description: EVOLVE_TOOL_DESCRIPTION,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'read', 'create', 'patch', 'verify', 'reference', 'archive', 'audit'],
          description: 'Operation to run.',
        },
        name: { type: 'string', description: 'Kebab-case skill name.' },
        description: { type: 'string', description: 'One-line catalog description; required for create.' },
        whenToUse: { type: 'string', description: 'Optional one-line routing hint.' },
        body: { type: 'string', description: 'Markdown body without frontmatter; required for create.' },
        old_text: { type: 'string', description: 'Exact substring to replace; required for patch.' },
        content: { type: 'string', description: 'Replacement text for patch.' },
        evidence: {
          type: 'string',
          description: 'What was tested and what result proved the procedure works; required for create, patch, reference, and verify.',
        },
        overwrite: { type: 'boolean', description: 'Replace an existing bundle after backing it up.' },
        reference_path: { type: 'string', description: 'references/..., scripts/..., or assets/... path for action=reference.' },
        reference_content: { type: 'string', description: 'Text to write for action=reference.' },
        references: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              path: { type: 'string', description: 'references/..., scripts/..., or assets/... path.' },
              content: { type: 'string', description: 'Resource text.' },
            },
            required: ['path', 'content'],
          },
          description: 'Optional resource files to create with a bundle.',
        },
      },
      required: ['action'],
    },
    output: {
      schema: EVOLVE_RESULT_SCHEMA,
      render: (_args, value) => renderEvolveResult(value),
    },
    execute(args) {
      switch (args.action) {
        case 'list':
          return { ok: true, action: 'list', summary: book.listSummary() }
        case 'audit':
          return { ok: true, action: 'audit', summary: book.auditSummary() }
        case 'read':
          return book.read(args.name)
        case 'create':
          return book.create(args)
        case 'patch':
          return book.patch(args)
        case 'verify':
          return book.verify(args)
        case 'reference':
          return book.reference(args)
        case 'archive':
          return book.archive(args.name)
        default:
          throw new Error(`unknown action ${JSON.stringify(args.action)}; use list, read, create, patch, verify, reference, archive, or audit`)
      }
    },
  })

  ctx.commands.register({
    name: 'evolve',
    description: 'Inspect DSH skills, verification state, and anti-bloat budgets',
    input: { hint: '[status|list|audit|paths|skill <name>]' },
    handler: ({ rawInput }) => evolveCommand(book, rawInput),
  })
}
