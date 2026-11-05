/**
 * User-facing rendering for the `/evolve` command.
 *
 * Kept free of Harness imports so the exact text is unit-tested.
 *
 * @module @local/dsh-soul-memory/evolve
 */

/**
 * Run `/evolve` against one skill book.
 * @param {import('./skills.js').SkillBook} book - the DSH skill book.
 * @param {string} rawInput - everything after the command name.
 * @returns {{ kind: 'success' | 'error', text: string }} command result.
 */
export function evolveCommand(book, rawInput) {
  const input = rawInput.trim()
  const [sub, ...rest] = input.length === 0 ? [] : input.split(/\s+/)

  if (sub === undefined || sub === 'status' || sub === 'list') {
    return { kind: 'success', text: book.listSummary() }
  }

  if (sub === 'audit') {
    return { kind: 'success', text: book.auditSummary() }
  }

  if (sub === 'paths') {
    return { kind: 'success', text: book.pathsSummary() }
  }

  if (sub === 'skill') {
    const name = rest[0]
    if (name === undefined) return { kind: 'error', text: 'Usage: /evolve skill <name>' }
    try {
      const result = book.read(name)
      return {
        kind: 'success',
        text: [`${result.name} — ${result.path} (${result.chars} chars, ${result.lines} lines)`, '', result.content].join('\n'),
      }
    } catch (error) {
      return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
    }
  }

  if (sub === 'help') {
    return {
      kind: 'success',
      text: [
        'Usage: /evolve [status|list|audit|paths|skill <name>]',
        '  status   skills, sizes, verification state',
        '  audit    stale/unverified/over-budget skills and memory budget',
        '  paths    absolute DSH/Hermes boundary paths',
        '  skill    show one skill body',
      ].join('\n'),
    }
  }

  return { kind: 'error', text: `Unknown argument ${JSON.stringify(input)}. Usage: /evolve [status|list|audit|paths|skill <name>]` }
}
