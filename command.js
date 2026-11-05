/**
 * User-facing rendering for the `/memory` command.
 *
 * Kept free of Harness imports so the exact user-visible text is unit-tested.
 *
 * @module @local/dsh-soul-memory/command
 */
import { relative } from 'node:path'

/** Longest file body one `/memory <target>` reply prints before truncating. */
const VIEW_CHARS = 6000

/**
 * Render a status line for one note file.
 * @param {import('./store.js').Notes} notes - the note store.
 * @param {{ target: string, label: string, path: string, chars: number, exists: boolean }} row - summary row.
 * @returns {string} display line.
 */
function statusLine(notes, row) {
  const feeds = row.target === 'soul'
    ? 'identity → system prompt'
    : row.target === 'user'
      ? 'user profile → session context'
      : 'notes → session context'
  const shown = row.exists ? `${row.chars.toLocaleString('en-US')} chars` : 'missing'
  const path = relative(notes.home, row.path) || row.path
  return `  ${row.label.padEnd(12)} ${path.padEnd(24)} ${shown.padEnd(12)} ${feeds}`
}

/**
 * Bound one file's text for a command reply.
 * @param {string} text - file content.
 * @returns {string} display text.
 */
function boundedView(text) {
  if (text.length <= VIEW_CHARS) return text
  return `${text.slice(0, VIEW_CHARS).trimEnd()}\n\n[Truncated at ${VIEW_CHARS} characters; open the file to read the rest.]`
}

/**
 * Run `/memory` against one note store.
 * @param {import('./store.js').Notes} notes - the note store.
 * @param {string} rawInput - everything after the command name.
 * @returns {{ kind: 'success' | 'error', text: string }} command result.
 */
export function memoryCommand(notes, rawInput) {
  const argument = rawInput.trim().toLowerCase()
  const summary = notes.summary()

  if (argument === '') {
    const lines = [`Soul & Memory — ${summary.home}`, ...summary.rows.map((row) => statusLine(notes, row))]
    if (summary.notFound) {
      lines.push('', 'No note files exist yet. Write SOUL.md yourself; USER.md and MEMORY.md appear when the agent saves something.')
    }
    lines.push(
      '',
      'Files are plain markdown: edit them directly, or ask the agent to remember something.',
      '/memory soul|user|memory shows one file; /memory paths lists absolute paths.',
    )
    return { kind: 'success', text: lines.join('\n') }
  }

  if (argument === 'paths') {
    const lines = summary.rows.map((row) => `${row.label.padEnd(12)} ${row.path}`)
    if (summary.journalEnabled) lines.push(`${'journal'.padEnd(12)} ${summary.journal}`)
    return { kind: 'success', text: lines.join('\n') }
  }

  if (argument === 'soul' || argument === 'user' || argument === 'memory') {
    const file = notes.read(argument)
    const body = file.content.length === 0 ? '(empty)' : boundedView(file.content)
    const hint = argument === 'soul'
      ? 'SOUL.md is yours to edit; it is injected as the first prompt section.'
      : 'The agent updates this file with the memory tool; you can edit it directly too.'
    return {
      kind: 'success',
      text: [`${file.target.toLowerCase()}.md — ${file.path} (${file.chars} chars)`, '', body, '', hint].join('\n'),
    }
  }

  return { kind: 'error', text: `Unknown argument ${JSON.stringify(rawInput.trim())}. Usage: /memory [soul|user|memory|paths]` }
}
