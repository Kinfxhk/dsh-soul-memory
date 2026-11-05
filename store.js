/**
 * File-backed notes for the Soul & Memory plugin.
 *
 * Three markdown files under the Harness home form the agent's persistent self:
 *
 *   SOUL.md             identity and voice, owned by the user
 *   memories/USER.md    durable facts about the user, owned by the agent
 *   memories/MEMORY.md  durable facts about the environment and the work, owned by the agent
 *
 * The module deliberately imports nothing from the Harness so the storage
 * contract can be unit-tested with plain Node.
 *
 * @module @local/dsh-soul-memory/store
 */
import { appendFileSync, copyFileSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'

/** Every file the plugin knows about. */
export const TARGETS = ['soul', 'user', 'memory']

/** The two files the agent may write; SOUL.md stays user-owned. */
export const WRITABLE_TARGETS = ['user', 'memory']

/** File-name used in messages, per target. */
const LABELS = { soul: 'SOUL.md', user: 'USER.md', memory: 'MEMORY.md' }

/** Defaults for every bound; a row may override any of them. */
const DEFAULTS = {
  maxSoulChars: 8000,
  maxMemoryChars: 12000,
  maxFileChars: 60000,
  maxEntryChars: 2000,
  maxBackups: 20,
}

/**
 * Expand a leading `~` to the current home directory.
 * @param {string} value - configured or default path.
 * @returns {string} path with the home prefix expanded.
 */
function expandHome(value) {
  return value.replace(/^~(?=$|[\\/])/, homedir())
}

/**
 * Resolve the directory that holds the soul and memory files.
 *
 * Precedence: the row's `home`, then `$DSH_HOME`, then `~/.dsh`. The files are
 * intentionally process-global, like `~/.hermes/SOUL.md`: an assistant's
 * identity should not change just because the working directory did.
 *
 * @param {Record<string, unknown>} options - raw plugin configuration.
 * @returns {string} absolute data root.
 */
export function resolveHome(options = {}) {
  const configured = typeof options.home === 'string' ? options.home.trim() : ''
  if (configured) return resolve(expandHome(configured))
  const env = process.env.DSH_HOME
  if (typeof env === 'string' && env.trim().length > 0) return resolve(env.trim())
  return join(homedir(), '.dsh')
}

/**
 * Resolve one configured file against the data root.
 * @param {string} home - absolute data root.
 * @param {unknown} configured - row value, when provided.
 * @param {string} fallback - default file name relative to the root.
 * @returns {string} absolute file path.
 */
function resolveFile(home, configured, fallback) {
  const value = typeof configured === 'string' && configured.trim().length > 0 ? configured.trim() : fallback
  const expanded = expandHome(value)
  return isAbsolute(expanded) ? resolve(expanded) : resolve(home, expanded)
}

/**
 * Read a non-negative integer bound, falling back when absent or invalid.
 * @param {unknown} value - configured value.
 * @param {number} fallback - default bound.
 * @returns {number} effective bound.
 */
function bound(value, fallback) {
  return Number.isSafeInteger(value) && value > 0 ? value : fallback
}

/**
 * Read one UTF-8 file without throwing for a missing path.
 * @param {string} path - absolute file path.
 * @returns {{ exists: boolean, text: string, mtimeMs: number, size: number }} file state.
 */
function readText(path) {
  try {
    const stats = statSync(path)
    return { exists: true, text: readFileSync(path, 'utf8'), mtimeMs: stats.mtimeMs, size: stats.size }
  } catch (error) {
    if (error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
      return { exists: false, text: '', mtimeMs: 0, size: -1 }
    }
    throw error
  }
}

/**
 * Count non-overlapping occurrences of one literal substring.
 * @param {string} haystack - text to search.
 * @param {string} needle - literal substring.
 * @returns {number} occurrence count.
 */
function countOccurrences(haystack, needle) {
  let count = 0
  let index = 0
  while ((index = haystack.indexOf(needle, index)) !== -1) {
    count += 1
    index += needle.length
  }
  return count
}

/**
 * Shorten text to a visible budget and say where the full text lives.
 * @param {string} text - source text.
 * @param {number} max - character budget.
 * @param {string} source - human-readable origin for the notice.
 * @returns {string} bounded text.
 */
function truncate(text, max, source) {
  if (text.length <= max) return text
  return `${text.slice(0, max).trimEnd()}\n\n[Truncated at ${max} characters; full text: ${source}]`
}

/**
 * Require a non-empty, trimmed string argument.
 * @param {unknown} value - model-supplied argument.
 * @param {string} name - argument name for the error.
 * @returns {string} trimmed text.
 */
function requireText(value, name) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string`)
  }
  return value.trim()
}

/**
 * Format one memory entry as a markdown list item, indenting continuation lines.
 * @param {string} content - validated entry text.
 * @returns {string} rendered entry.
 */
function formatEntry(content) {
  const lines = content.split(/\r?\n/).map((line) => line.trimEnd())
  return lines
    .map((line, index) => (index === 0 ? `- ${line}` : line.length === 0 ? '' : `  ${line}`))
    .join('\n')
}

/**
 * The persistent soul and memory files, with serialized writes.
 */
export class Notes {
  /**
   * @param {Record<string, unknown>} options - raw plugin configuration.
   */
  constructor(options = {}) {
    const home = resolveHome(options)
    this.home = home
    this.paths = {
      soul: resolveFile(home, options.soulFile, 'SOUL.md'),
      user: resolveFile(home, options.userFile, join('memories', 'USER.md')),
      memory: resolveFile(home, options.memoryFile, join('memories', 'MEMORY.md')),
    }
    this.journalPath = join(dirname(this.paths.user), 'journal.jsonl')
    this.journal = options.journal !== false
    this.maxSoulChars = bound(options.maxSoulChars, DEFAULTS.maxSoulChars)
    this.maxMemoryChars = bound(options.maxMemoryChars, DEFAULTS.maxMemoryChars)
    this.maxFileChars = bound(options.maxFileChars, DEFAULTS.maxFileChars)
    this.maxEntryChars = bound(options.maxEntryChars, DEFAULTS.maxEntryChars)
    this.maxBackups = bound(options.maxBackups, DEFAULTS.maxBackups)
    this.cache = new Map()
    this.chain = Promise.resolve()
  }

  /** Create the parent directories of every note file. */
  ensureHome() {
    for (const target of TARGETS) mkdirSync(dirname(this.paths[target]), { recursive: true })
  }

  /**
   * The injected identity section, or an empty string when SOUL.md has no text.
   * @returns {string} prompt-ready section body.
   */
  promptSoul() {
    const soul = this.#safeText('soul').trim()
    if (soul.length === 0) return ''
    return `## Soul\n\n${truncate(soul, this.maxSoulChars, this.paths.soul)}`
  }

  /**
   * The injected user-profile and long-term-memory snapshot.
   * @returns {string} prompt-ready context body.
   */
  promptMemory() {
    const user = this.#safeText('user').trim()
    const memory = this.#safeText('memory').trim()
    if (user.length === 0 && memory.length === 0) return ''
    const parts = []
    if (user.length > 0) parts.push(`## User profile\n\n${user}`)
    if (memory.length > 0) parts.push(`## Long-term memory\n\n${memory}`)
    let text = parts.join('\n\n')
    if (text.length > this.maxMemoryChars) {
      return `${text.slice(0, this.maxMemoryChars).trimEnd()}\n\n[Memory truncated at ${this.maxMemoryChars} characters; files: ${this.home}]`
    }
    if (text.length > this.maxMemoryChars * 0.8) {
      text += `\n\n[Memory is at ${text.length} / ${this.maxMemoryChars} characters; consolidate stale entries before adding more.]`
    }
    return text
  }

  /**
   * Per-file state for the status command.
   * @returns {{ home: string, notFound: boolean, rows: Array<{ target: string, label: string, path: string, chars: number, exists: boolean }>, journal: string, journalEnabled: boolean }} summary.
   */
  summary() {
    const rows = TARGETS.map((target) => {
      try {
        const file = readText(this.paths[target])
        return { target, label: LABELS[target], path: this.paths[target], chars: file.text.length, exists: file.exists }
      } catch {
        return { target, label: LABELS[target], path: this.paths[target], chars: 0, exists: false }
      }
    })
    return {
      home: this.home,
      notFound: rows.every((row) => !row.exists),
      rows,
      journal: this.journalPath,
      journalEnabled: this.journal,
    }
  }

  /**
   * Read one note file.
   * @param {string} target - `soul`, `user`, or `memory`.
   * @returns {Record<string, unknown>} canonical tool result.
   */
  read(target) {
    this.#assertTarget(target)
    const file = readText(this.paths[target])
    return {
      action: 'read',
      target,
      path: this.paths[target],
      chars: file.text.length,
      ok: true,
      ...(file.exists ? {} : { note: `${LABELS[target]} does not exist yet at ${this.paths[target]}` }),
      content: file.text,
    }
  }

  /**
   * Append one durable entry.
   * @param {string} target - `user` or `memory`.
   * @param {string} content - entry text.
   * @returns {Promise<Record<string, unknown>>} canonical tool result.
   */
  async add(target, content) {
    this.#assertWritable(target)
    const entry = formatEntry(requireText(content, 'content'))
    if (entry.length > this.maxEntryChars) {
      throw new Error(`content is ${entry.length} characters; one entry is limited to ${this.maxEntryChars}`)
    }
    return this.#exclusive(() => {
      const current = this.#textForWrite(target).trimEnd()
      const next = current.length === 0 ? `${entry}\n` : `${current}\n\n${entry}\n`
      return this.#commit(target, next, 'add', entry)
    })
  }

  /**
   * Replace one uniquely matching substring.
   * @param {string} target - `user` or `memory`.
   * @param {string} oldText - exact existing substring.
   * @param {string} content - replacement text.
   * @returns {Promise<Record<string, unknown>>} canonical tool result.
   */
  async replace(target, oldText, content) {
    this.#assertWritable(target)
    const needle = requireText(oldText, 'old_text')
    const replacement = requireText(content, 'content')
    if (replacement.length > this.maxEntryChars) {
      throw new Error(`content is ${replacement.length} characters; one entry is limited to ${this.maxEntryChars}`)
    }
    return this.#exclusive(() => {
      const current = this.#textForWrite(target)
      this.#assertUnique(current, needle, target)
      return this.#commit(target, current.replace(needle, replacement), 'replace', replacement)
    })
  }

  /**
   * Delete one uniquely matching substring.
   * @param {string} target - `user` or `memory`.
   * @param {string} oldText - exact existing substring.
   * @returns {Promise<Record<string, unknown>>} canonical tool result.
   */
  async remove(target, oldText) {
    this.#assertWritable(target)
    const needle = requireText(oldText, 'old_text')
    return this.#exclusive(() => {
      const current = this.#textForWrite(target)
      this.#assertUnique(current, needle, target)
      const without = current.replace(needle, '')
      const cleaned = without
        .replace(/^[ \t]*[-*+][ \t]*$/gm, '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
      return this.#commit(target, cleaned.length === 0 ? '' : `${cleaned}\n`, 'remove', needle)
    })
  }

  /**
   * Replace a whole file from the editor. This is the user-owned path: unlike
   * the `memory` tool, it may write SOUL.md because the user is the author.
   * @param {string} target - `soul`, `user`, or `memory`.
   * @param {string} content - complete new file text.
   * @returns {Promise<Record<string, unknown>>} canonical result.
   */
  async set(target, content) {
    this.#assertTarget(target)
    if (typeof content !== 'string') throw new Error('content must be a string')
    const next = content.replace(/\r\n/g, '\n')
    if (next.length > this.maxFileChars) {
      throw new Error(`${LABELS[target]} would be ${next.length} characters; the file cap is ${this.maxFileChars}`)
    }
    return this.#exclusive(() => {
      this.#backupFile(target)
      return this.#commit(target, next, 'set', next.slice(0, 120))
    })
  }

  /**
   * Validate a target name.
   * @param {string} target - candidate name.
   */
  #assertTarget(target) {
    if (!TARGETS.includes(target)) {
      throw new Error(`unknown target ${JSON.stringify(target)}; use soul, user, or memory`)
    }
  }

  /**
   * Reject writes to the user-owned identity file.
   * @param {string} target - candidate name.
   */
  #assertWritable(target) {
    this.#assertTarget(target)
    if (!WRITABLE_TARGETS.includes(target)) {
      throw new Error('SOUL.md is owned by the user and cannot be edited by the agent; read it with action read instead')
    }
  }

  /**
   * Require exactly one occurrence of the needle.
   * @param {string} current - file text.
   * @param {string} needle - literal substring.
   * @param {string} target - target name for the message.
   */
  #assertUnique(current, needle, target) {
    const count = countOccurrences(current, needle)
    if (count === 0) throw new Error(`old_text was not found in ${LABELS[target]} (${this.paths[target]})`)
    if (count > 1) {
      throw new Error(`old_text matches ${count} places in ${LABELS[target]}; pass a longer exact substring that identifies one entry`)
    }
  }

  /**
   * Read a file for a read-modify-write cycle; missing counts as empty.
   * @param {string} target - target name.
   * @returns {string} current text.
   */
  #textForWrite(target) {
    return readText(this.paths[target]).text
  }

  /**
   * Keep a small, pruned copy of the file before an editor overwrite.
   * @param {string} target - target name.
   */
  #backupFile(target) {
    const path = this.paths[target]
    try {
      statSync(path)
    } catch {
      return
    }
    const directory = join(dirname(path), '.backups')
    try {
      mkdirSync(directory, { recursive: true })
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      copyFileSync(path, join(directory, `${target}-${stamp}.md`))
      const files = readdirSync(directory)
        .filter((name) => name.startsWith(`${target}-`) && name.endsWith('.md'))
        .sort()
      while (files.length > this.maxBackups) {
        rmSync(join(directory, files.shift()), { force: true })
      }
    } catch {
      // Backups are advisory; the save itself must still proceed.
    }
  }

  /**
   * Persist one write, refresh the prompt cache, and append an audit record.
   * @param {string} target - target name.
   * @param {string} next - complete new file text.
   * @param {string} action - audit action.
   * @param {string} preview - audit preview.
   * @returns {Promise<Record<string, unknown>>} canonical tool result.
   */
  #commit(target, next, action, preview) {
    if (next.length > this.maxFileChars) {
      throw new Error(`${LABELS[target]} would reach ${next.length} characters, over the ${this.maxFileChars} limit; remove an entry or raise maxFileChars`)
    }
    const path = this.paths[target]
    mkdirSync(dirname(path), { recursive: true })
    const temporary = `${path}.${process.pid}.${Date.now()}.tmp`
    try {
      writeFileSync(temporary, next, 'utf8')
      renameSync(temporary, path)
    } catch (error) {
      try {
        unlinkSync(temporary)
      } catch {
        // The temporary file may never have been created; the original error is the useful one.
      }
      throw error
    }
    this.cache.delete(target)
    this.#journal({ action, target, chars: next.length, preview: preview.slice(0, 120) })
    return Promise.resolve({
      action,
      target,
      path,
      chars: next.length,
      ok: true,
    })
  }

  /**
   * Append one JSON line to the audit journal. Journal failures never fail a write.
   * @param {{ action: string, target: string, chars: number, preview: string }} record - audit record.
   */
  #journal(record) {
    if (!this.journal) return
    try {
      mkdirSync(dirname(this.journalPath), { recursive: true })
      appendFileSync(this.journalPath, `${JSON.stringify({ at: new Date().toISOString(), ...record })}\n`, 'utf8')
    } catch {
      // The journal is advisory; the note files are the source of truth.
    }
  }

  /**
   * Serialize read-modify-write cycles so overlapping tool calls cannot lose an entry.
   * @template T
   * @param {() => T} run - cycle body.
   * @returns {Promise<T>} cycle result.
   */
  #exclusive(run) {
    const result = this.chain.then(() => run())
    this.chain = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  /**
   * Read a file for prompt rendering, tolerating every read failure and
   * re-reading only when the file's stat identity changed.
   * @param {string} target - target name.
   * @returns {string} file text, or an empty string.
   */
  #safeText(target) {
    const path = this.paths[target]
    try {
      const stats = statSync(path)
      const cached = this.cache.get(target)
      if (cached !== undefined && cached.mtimeMs === stats.mtimeMs && cached.size === stats.size) {
        return cached.text
      }
      const text = readFileSync(path, 'utf8')
      this.cache.set(target, { mtimeMs: stats.mtimeMs, size: stats.size, text })
      return text
    } catch {
      return ''
    }
  }
}
