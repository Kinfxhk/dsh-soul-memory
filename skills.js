/**
 * DSH skill book: the writable, auditable skill half of the persistent self.
 *
 * Skills are procedures, memory is facts, and SOUL.md is identity. This module
 * only touches the DSH skill root (`<dshHome>/skills`), which the Harness
 * filesystem skill provider already watches, and its own state directory
 * (`<dshHome>/evolved`). Hermes lives in a different store and is never read or
 * written here.
 *
 * Every write is gated on evidence, capped for context safety, backed up, and
 * journaled. Long material belongs in `references/` or `scripts/`, not in
 * `SKILL.md`, because the catalog carries only the description and a loaded
 * skill body is paid for in context.
 *
 * @module @local/dsh-soul-memory/skills
 */
import { appendFileSync, copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { resolveHome } from './store.js'

/** Defaults; a row may override any of them. */
export const DEFAULTS = {
  maxSkillChars: 24000,
  maxSkillLines: 500,
  maxDescriptionChars: 400,
  maxWhenToUseChars: 300,
  maxReferenceChars: 120000,
  maxReferences: 24,
  maxEvidenceChars: 600,
  staleAfterDays: 30,
  maxBackupSets: 40,
  maxJournalBytes: 2000000,
  memoryBudget: 12000,
  journal: true,
}

/** Kebab-case skill names, as required by the Harness skill provider. */
const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Frontmatter is the first `---` block of a SKILL.md. */
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/

/** Resources are the only paths a skill bundle may write below SKILL.md. */
const RESOURCE_RE = /^(references|scripts|assets)\/[A-Za-z0-9._\-/]+$/

/** Secret shapes that must never enter a skill. */
const SECRET_RE = /(?:sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/

/**
 * Resolve a configured path, expanding a leading `~`.
 * @param {string} home - DSH home.
 * @param {unknown} configured - row value.
 * @param {string} fallback - default relative path.
 * @returns {string} absolute path.
 */
function resolvePath(home, configured, fallback) {
  const raw = typeof configured === 'string' && configured.trim().length > 0 ? configured.trim() : fallback
  const expanded = raw.replace(/^~(?=$|[\\/])/, homedir())
  return isAbsolute(expanded) ? resolve(expanded) : resolve(home, expanded)
}

/**
 * The Hermes home, used only as a hard separation guard.
 * @param {Record<string, unknown>} options - row configuration.
 * @returns {string} absolute Hermes home.
 */
export function resolveHermesHome(options = {}) {
  const configured = typeof options.hermesHome === 'string' ? options.hermesHome.trim() : ''
  if (configured) return resolve(configured)
  const fromEnv = process.env.HERMES_HOME
  if (typeof fromEnv === 'string' && fromEnv.trim().length > 0) return resolve(fromEnv.trim())
  const local = process.env.LOCALAPPDATA
  if (typeof local === 'string' && local.trim().length > 0) return resolve(join(local, 'hermes'))
  return resolve(join(homedir(), '.hermes'))
}

/**
 * Whether `child` is equal to or below `parent` (case-insensitive on Windows).
 * @param {string} parent - containing path.
 * @param {string} child - candidate path.
 * @returns {boolean} true when child is inside parent.
 */
function isInside(parent, child) {
  const from = resolve(parent).toLowerCase()
  const to = resolve(child).toLowerCase()
  const rel = relative(from, to)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/**
 * Refuse a configured root that would write into Hermes.
 * @param {string} target - configured DSH root.
 * @param {string} hermesHome - Hermes home.
 * @param {string} label - field name for the error.
 */
function assertSeparate(target, hermesHome, label) {
  if (isInside(hermesHome, target)) {
    throw new Error(`${label} resolves inside the Hermes home (${hermesHome}); DSH and Hermes keep separate soul/skill/memory stores`)
  }
}

/**
 * Read one file without throwing for a missing path.
 * @param {string} path - file path.
 * @returns {string} text, or an empty string.
 */
function readIfPresent(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

/**
 * SHA-256 of text, used to tie evidence to the exact body that was verified.
 * @param {string} text - skill text.
 * @returns {string} hex digest.
 */
function digest(text) {
  return createHash('sha256').update(text).digest('hex')
}

/**
 * Split YAML frontmatter from a SKILL.md body.
 * @param {string} text - complete file text.
 * @returns {{ exists: boolean, fields: Record<string, string>, body: string, frontmatter: string }} parsed file.
 */
export function parseFrontmatter(text) {
  const match = FRONTMATTER_RE.exec(text)
  if (match === null) return { exists: false, fields: {}, body: text, frontmatter: '' }
  const fields = {}
  for (const line of match[1].split(/\r?\n/)) {
    const pair = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/.exec(line)
    if (pair === null) continue
    fields[pair[1]] = unquote(pair[2])
  }
  return { exists: true, fields, body: text.slice(match[0].length), frontmatter: match[0] }
}

/**
 * Unquote a simple YAML scalar.
 * @param {string} value - raw scalar.
 * @returns {string} scalar text.
 */
function unquote(value) {
  const trimmed = value.trim()
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed)
    } catch {
      return trimmed.slice(1, -1)
    }
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) return trimmed.slice(1, -1)
  return trimmed
}

/**
 * Quote one YAML scalar as a single line.
 * @param {string} value - text.
 * @returns {string} quoted scalar.
 */
function yamlString(value) {
  return JSON.stringify(String(value).replace(/\s+/g, ' ').trim())
}

/**
 * Require a kebab-case skill name.
 * @param {unknown} value - candidate.
 * @returns {string} valid name.
 */
function requireName(value) {
  const name = typeof value === 'string' ? value.trim() : ''
  if (name.length < 2 || name.length > 64 || !NAME_RE.test(name)) {
    throw new Error('name must be kebab-case: 2-64 characters of a-z, 0-9, and single hyphens')
  }
  return name
}

/**
 * Require one non-empty single-line field.
 * @param {unknown} value - candidate.
 * @param {string} field - field name for the error.
 * @param {number} max - character cap.
 * @returns {string} normalized text.
 */
function requireLine(value, field, max) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${field} must be a non-empty string`)
  const text = value.replace(/\s+/g, ' ').trim()
  if (text.length > max) throw new Error(`${field} is ${text.length} characters; the cap is ${max}`)
  return text
}

/**
 * Require an optional single-line field.
 * @param {unknown} value - candidate.
 * @param {string} field - field name for the error.
 * @param {number} max - character cap.
 * @returns {string} normalized text, or an empty string.
 */
function optionalLine(value, field, max) {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim().length === 0)) return ''
  return requireLine(value, field, max)
}

/**
 * Require evidence that the procedure was tested once.
 * @param {unknown} value - candidate.
 * @param {number} max - character cap.
 * @returns {string} evidence.
 */
function requireEvidence(value, max) {
  if (typeof value !== 'string' || value.trim().length < 20) {
    throw new Error('evidence must describe the successful test (at least 20 characters); unverified procedures are not written')
  }
  return value.replace(/\s+/g, ' ').trim().slice(0, max)
}

/**
 * Count non-overlapping occurrences of a literal substring.
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
 * Reject context bombs and obvious secrets before anything reaches disk.
 * @param {string} text - candidate content.
 * @param {string} label - file label for errors.
 * @param {{ maxChars: number, maxLines: number, maxLineChars?: number, repeated?: boolean }} limits - caps.
 */
function assertSafeText(text, label, limits) {
  if (typeof text !== 'string' || text.trim().length === 0) throw new Error(`${label} is empty`)
  if (text.length > limits.maxChars) throw new Error(`${label} is ${text.length} characters; the cap is ${limits.maxChars}; move detail into references/`)
  if (text.includes('\u0000')) throw new Error(`${label} contains a NUL byte; binary content is not allowed`)
  if (SECRET_RE.test(text)) throw new Error(`${label} looks like it contains a credential; use an environment variable reference instead`)

  const lines = text.split(/\r?\n/)
  if (lines.length > limits.maxLines) throw new Error(`${label} has ${lines.length} lines; the cap is ${limits.maxLines}; split it into references/`)
  const maxLineChars = limits.maxLineChars ?? 4000
  const longest = lines.reduce((max, line) => Math.max(max, line.length), 0)
  if (longest > maxLineChars) throw new Error(`${label} has a ${longest}-character line; the cap is ${maxLineChars}; split it or move it into a resource file`)

  if (/(?:[A-Za-z0-9+/]{600,}={0,2})/.test(text)) {
    throw new Error(`${label} looks like a base64 dump; store a file reference instead`)
  }

  if (limits.repeated === true) {
    const nonEmpty = lines.map((line) => line.trim()).filter((line) => line.length > 0)
    if (nonEmpty.length >= 40) {
      const unique = new Set(nonEmpty).size
      if (unique / nonEmpty.length < 0.55) {
        throw new Error(`${label} looks like a repeated dump (${unique}/${nonEmpty.length} unique lines); summarize it`)
      }
    }
  }
}

/**
 * Resolve one resource path inside a skill bundle.
 * @param {string} targetDir - skill directory.
 * @param {unknown} value - candidate relative path.
 * @returns {string} normalized relative path.
 */
function requireResourcePath(targetDir, value) {
  if (typeof value !== 'string') throw new Error('reference path must be a string')
  const path = value.replace(/\\/g, '/').replace(/^\.\//, '')
  if (path.startsWith('/') || path.includes('..')) throw new Error(`reference path ${JSON.stringify(value)} escapes the skill directory`)
  if (!RESOURCE_RE.test(path)) throw new Error('reference path must start with references/, scripts/, or assets/, and use only letters, digits, dot, dash, underscore, and slash')
  const destination = resolve(targetDir, path)
  if (!isInside(targetDir, destination)) throw new Error(`reference path ${JSON.stringify(value)} escapes the skill directory`)
  return path
}

/**
 * Compose a SKILL.md with verifiable frontmatter.
 * @param {{ name: string, description: string, whenToUse: string, body: string, evidence: string, version: number }} input - skill fields.
 * @returns {string} complete SKILL.md.
 */
function composeSkill(input) {
  const lines = [
    '---',
    `name: ${input.name}`,
    `description: ${yamlString(input.description)}`,
  ]
  if (input.whenToUse.length > 0) lines.push(`whenToUse: ${yamlString(input.whenToUse)}`)
  lines.push(
    'metadata:',
    '  origin: dsh-evolve',
    `  version: ${input.version}`,
    `  lastVerified: ${new Date().toISOString().slice(0, 10)}`,
    `  evidence: ${yamlString(input.evidence)}`,
    '---',
    '',
    input.body.trim(),
    '',
  )
  return lines.join('\n')
}

/**
 * The DSH skill store with serialized, backed-up writes.
 */
export class SkillBook {
  /**
   * @param {Record<string, unknown>} options - row configuration.
   */
  constructor(options = {}) {
    this.home = resolveHome(options)
    this.skillsDir = resolvePath(this.home, options.skillsDir, 'skills')
    this.stateDir = resolvePath(this.home, options.stateDir, 'evolved')
    this.hermesHome = resolveHermesHome(options)
    assertSeparate(this.skillsDir, this.hermesHome, 'skillsDir')
    assertSeparate(this.stateDir, this.hermesHome, 'stateDir')

    this.maxSkillChars = bound(options.maxSkillChars, DEFAULTS.maxSkillChars)
    this.maxSkillLines = bound(options.maxSkillLines, DEFAULTS.maxSkillLines)
    this.maxDescriptionChars = bound(options.maxDescriptionChars, DEFAULTS.maxDescriptionChars)
    this.maxWhenToUseChars = bound(options.maxWhenToUseChars, DEFAULTS.maxWhenToUseChars)
    this.maxReferenceChars = bound(options.maxReferenceChars, DEFAULTS.maxReferenceChars)
    this.maxReferences = bound(options.maxReferences, DEFAULTS.maxReferences)
    this.maxEvidenceChars = bound(options.maxEvidenceChars, DEFAULTS.maxEvidenceChars)
    this.staleAfterDays = bound(options.staleAfterDays, DEFAULTS.staleAfterDays)
    this.maxBackupSets = bound(options.maxBackupSets, DEFAULTS.maxBackupSets)
    this.maxJournalBytes = bound(options.maxJournalBytes, DEFAULTS.maxJournalBytes)
    this.memoryBudget = bound(options.memoryBudget, DEFAULTS.memoryBudget)
    this.journal = options.journal !== false
    this.chain = Promise.resolve()
  }

  /** Create the skill and state directories. */
  ensureHome() {
    mkdirSync(this.skillsDir, { recursive: true })
    mkdirSync(this.stateDir, { recursive: true })
    mkdirSync(this.backupsDir, { recursive: true })
    mkdirSync(this.verifiedDir, { recursive: true })
    mkdirSync(this.archiveDir, { recursive: true })
  }

  /** Absolute backup directory. */
  get backupsDir() {
    return join(this.stateDir, 'backups')
  }

  /** Absolute verification sidecar directory. */
  get verifiedDir() {
    return join(this.stateDir, 'verified')
  }

  /** Absolute archive directory. */
  get archiveDir() {
    return join(this.stateDir, 'archive')
  }

  /** Absolute journal path. */
  get journalPath() {
    return join(this.stateDir, 'journal.jsonl')
  }

  /**
   * Scan the DSH skill root.
   * @returns {Array<{ name: string, path: string, bundle: boolean, chars: number, lines: number, description: string, whenToUse: string, verifiedAt: string | null, verified: boolean, stale: boolean, overBudget: boolean, sha256: string }>} rows.
   */
  list() {
    let entries
    try {
      entries = readdirSync(this.skillsDir, { withFileTypes: true })
    } catch {
      return []
    }

    const rows = []
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const full = join(this.skillsDir, entry.name)
      if (entry.isDirectory()) {
        const file = join(full, 'SKILL.md')
        if (!existsSync(file)) continue
        try {
          rows.push(this.#row(entry.name, file, true))
        } catch {
          // A malformed or unreadable skill is reported by audit, not by list.
        }
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        try {
          rows.push(this.#row(entry.name.slice(0, -3), full, false))
        } catch {
          // Ignore unreadable flat files in the catalog view.
        }
      }
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name))
  }

  /**
   * One catalog row.
   * @param {string} name - skill name.
   * @param {string} path - SKILL.md or flat file.
   * @param {boolean} bundle - whether this is a directory bundle.
   * @returns {Record<string, unknown>} row.
   */
  #row(name, path, bundle) {
    const text = readFileSync(path, 'utf8')
    const parsed = parseFrontmatter(text)
    const chars = text.length
    const lines = text.split(/\r?\n/).length
    const sha256 = digest(text)
    const record = this.#readVerified(name)
    const verified = record !== null && record.sha256 === sha256
    const verifiedAt = verified && Number.isFinite(Date.parse(record.at)) ? Date.parse(record.at) : Number.NaN
    const age = Number.isFinite(verifiedAt) ? (Date.now() - verifiedAt) / 86400000 : Number.POSITIVE_INFINITY
    return {
      name,
      path,
      bundle,
      chars,
      lines,
      description: parsed.fields.description ?? '',
      whenToUse: parsed.fields.whenToUse ?? '',
      verifiedAt: verified ? record.at : null,
      verified,
      stale: !verified || age > this.staleAfterDays,
      overBudget: chars > this.maxSkillChars * 0.8 || lines > this.maxSkillLines * 0.8,
      sha256,
    }
  }

  /**
   * Read one skill body.
   * @param {string} name - skill name.
   * @returns {{ ok: boolean, action: string, name: string, path: string, chars: number, lines: number, summary: string, content: string }} result.
   */
  read(name) {
    const located = this.#existingPath(name)
    const text = readFileSync(located.path, 'utf8')
    const chars = text.length
    const lines = text.split(/\r?\n/).length
    const view = chars <= 30000 ? text : `${text.slice(0, 30000).trimEnd()}\n\n[Truncated at 30000 characters; read ${located.path} for the rest.]`
    return {
      ok: true,
      action: 'read',
      name,
      path: located.path,
      chars,
      lines,
      summary: `read ${name} — ${located.path} (${chars} chars, ${lines} lines)`,
      content: view,
    }
  }

  /**
   * Create a new skill bundle.
   * @param {Record<string, unknown>} input - create arguments.
   * @returns {Promise<Record<string, unknown>>} result.
   */
  async create(input) {
    const name = requireName(input.name)
    const description = requireLine(input.description, 'description', this.maxDescriptionChars)
    const whenToUse = optionalLine(input.whenToUse, 'whenToUse', this.maxWhenToUseChars)
    const evidence = requireEvidence(input.evidence, this.maxEvidenceChars)
    if (typeof input.body !== 'string' || input.body.trim().length < 20) {
      throw new Error('body must be the procedure text without frontmatter (at least 20 characters)')
    }
    const references = this.#normalizeReferences(input.references)
    const targetDir = join(this.skillsDir, name)

    return this.#exclusive(() => {
      const flat = join(this.skillsDir, `${name}.md`)
      const existing = existsSync(targetDir) || existsSync(flat)
      if (existing && input.overwrite !== true) {
        throw new Error(`${name} already exists; pass overwrite: true or use patch to change it`)
      }
      if (existsSync(flat)) throw new Error(`${name} exists as a flat file; archive it before creating a bundle`)

      const version = existing ? this.#nextVersion(targetDir) : 1
      const text = composeSkill({ name, description, whenToUse, body: input.body.trim(), evidence, version })
      this.#validateSkill(name, text)

      if (existing) {
        this.#backup(targetDir, name)
        rmSync(targetDir, { recursive: true, force: true })
      }
      mkdirSync(targetDir, { recursive: true })
      for (const reference of references) this.#writeReference(targetDir, reference)
      this.#atomicWrite(join(targetDir, 'SKILL.md'), text)
      this.#recordVerified(name, join(targetDir, 'SKILL.md'), text, evidence)
      this.#journal({ action: 'create', name, chars: text.length, evidence })

      return this.#result('create', name, join(targetDir, 'SKILL.md'), text, 'verified')
    })
  }

  /**
   * Patch one unambiguous substring of an existing skill.
   * @param {Record<string, unknown>} input - patch arguments.
   * @returns {Promise<Record<string, unknown>>} result.
   */
  async patch(input) {
    const name = requireName(input.name)
    const evidence = requireEvidence(input.evidence, this.maxEvidenceChars)
    if (typeof input.old_text !== 'string' || input.old_text.trim().length === 0) {
      throw new Error('old_text must be a non-empty string')
    }
    if (typeof input.content !== 'string' || input.content.trim().length === 0) {
      throw new Error('content must be a non-empty replacement')
    }
    const located = this.#existingPath(name)

    return this.#exclusive(() => {
      const current = readFileSync(located.path, 'utf8')
      const needle = input.old_text.trim()
      const count = countOccurrences(current, needle)
      if (count === 0) throw new Error(`old_text was not found in ${located.path}`)
      if (count > 1) throw new Error(`old_text matches ${count} places; pass a longer exact substring`)
      const next = current.replace(needle, input.content.trim())
      this.#validateSkill(name, next)
      this.#backup(located.path, name)
      this.#atomicWrite(located.path, next)
      this.#recordVerified(name, located.path, next, evidence)
      this.#journal({ action: 'patch', name, chars: next.length, evidence })
      return this.#result('patch', name, located.path, next, 'verified')
    })
  }

  /**
   * Record a re-test without changing the body.
   * @param {Record<string, unknown>} input - verify arguments.
   * @returns {Promise<Record<string, unknown>>} result.
   */
  async verify(input) {
    const name = requireName(input.name)
    const evidence = requireEvidence(input.evidence, this.maxEvidenceChars)
    const located = this.#existingPath(name)

    return this.#exclusive(() => {
      const text = readFileSync(located.path, 'utf8')
      this.#recordVerified(name, located.path, text, evidence)
      this.#journal({ action: 'verify', name, chars: text.length, evidence })
      return this.#result('verify', name, located.path, text, `verified against ${digest(text).slice(0, 12)}`)
    })
  }

  /**
   * Write one resource file inside an existing bundle.
   * @param {Record<string, unknown>} input - reference arguments.
   * @returns {Promise<Record<string, unknown>>} result.
   */
  async reference(input) {
    const name = requireName(input.name)
    const located = this.#existingPath(name)
    if (!located.bundle) throw new Error('resources belong to directory bundles, not flat skill files')
    const evidence = requireEvidence(input.evidence, this.maxEvidenceChars)
    const targetDir = dirname(located.path)
    const path = requireResourcePath(targetDir, input.reference_path)
    if (typeof input.reference_content !== 'string') throw new Error('reference_content must be a string')

    return this.#exclusive(() => {
      const written = this.#writeReference(targetDir, { path, content: input.reference_content })
      this.#journal({ action: 'reference', name, path, chars: written.chars, evidence })
      return {
        ok: true,
        action: 'reference',
        name,
        path: join(targetDir, path),
        chars: written.chars,
        lines: input.reference_content.split(/\r?\n/).length,
        summary: `reference ${name}/${path} — ${written.chars} chars (${evidence.slice(0, 80)})`,
      }
    })
  }

  /**
   * Move one skill out of the catalog.
   * @param {string} name - skill name.
   * @returns {Promise<Record<string, unknown>>} result.
   */
  async archive(name) {
    const valid = requireName(name)
    const located = this.#existingPath(valid)
    return this.#exclusive(() => {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const destination = join(this.archiveDir, `${valid}-${stamp}`)
      this.#backup(located.path, valid)
      mkdirSync(destination, { recursive: true })
      if (located.bundle) {
        renameSync(dirname(located.path), join(destination, 'bundle'))
      } else {
        renameSync(located.path, join(destination, `${valid}.md`))
      }
      this.#removeVerified(valid)
      this.#journal({ action: 'archive', name: valid, path: destination })
      return {
        ok: true,
        action: 'archive',
        name: valid,
        path: destination,
        summary: `archived ${valid} → ${destination}`,
      }
    })
  }

  /**
   * Audit the skill store and the memory budget.
   * @returns {Record<string, unknown>} audit report.
   */
  audit() {
    const rows = this.list()
    const totalChars = rows.reduce((sum, row) => sum + row.chars, 0)
    const largest = [...rows].sort((a, b) => b.chars - a.chars).slice(0, 5)
    const unverified = rows.filter((row) => !row.verified)
    const stale = rows.filter((row) => row.verified && row.stale)
    const overBudget = rows.filter((row) => row.overBudget)
    const userChars = readIfPresent(join(this.home, 'memories', 'USER.md')).length
    const memoryChars = readIfPresent(join(this.home, 'memories', 'MEMORY.md')).length
    const backups = this.#directoryStats(this.backupsDir)
    const journalChars = readIfPresent(this.journalPath).length

    return {
      skillsDir: this.skillsDir,
      stateDir: this.stateDir,
      count: rows.length,
      totalChars,
      largest,
      unverified: unverified.map((row) => row.name),
      stale: stale.map((row) => ({ name: row.name, verifiedAt: row.verifiedAt })),
      overBudget: overBudget.map((row) => ({ name: row.name, chars: row.chars, lines: row.lines })),
      memory: { userChars, memoryChars, budget: this.memoryBudget, totalChars: userChars + memoryChars },
      backups,
      journalChars,
    }
  }

  /** Human-readable catalog list. */
  listSummary() {
    const rows = this.list()
    if (rows.length === 0) {
      return `Skills — ${this.skillsDir}\n  (no DSH skills yet; use evolve action=create after a verified procedure)`
    }
    const width = Math.max(16, ...rows.map((row) => row.name.length))
    const lines = [`Skills — ${this.skillsDir}`, `  ${rows.length} skill(s), ${rows.reduce((sum, row) => sum + row.chars, 0)} chars`]
    for (const row of rows) {
      const state = row.verified ? `verified ${row.verifiedAt?.slice(0, 10)}` : 'UNVERIFIED'
      lines.push(`  ${row.name.padEnd(width)} ${String(row.chars).padStart(6)} chars  ${state}${row.overBudget ? '  OVER-BUDGET' : ''}`)
    }
    return lines.join('\n')
  }

  /** Human-readable audit. */
  auditSummary() {
    const report = this.audit()
    const lines = [
      `Evolution audit — ${report.skillsDir}`,
      `  skills: ${report.count} (${report.totalChars} chars); state: ${report.stateDir}`,
    ]
    if (report.largest.length > 0) {
      lines.push(`  largest: ${report.largest.map((row) => `${row.name} ${row.chars}`).join(', ')}`)
    }
    if (report.unverified.length > 0) lines.push(`  unverified: ${report.unverified.join(', ')}`)
    if (report.stale.length > 0) lines.push(`  stale: ${report.stale.map((row) => `${row.name} (${row.verifiedAt?.slice(0, 10)})`).join(', ')}`)
    if (report.overBudget.length > 0) lines.push(`  over 80% budget: ${report.overBudget.map((row) => `${row.name} ${row.chars} chars/${row.lines} lines`).join(', ')}`)
    lines.push(`  memory: USER.md ${report.memory.userChars} + MEMORY.md ${report.memory.memoryChars} / ${report.memory.budget} chars`)
    lines.push(`  backups: ${report.backups.sets} set(s), ${report.backups.chars} chars; journal: ${report.journalChars} chars`)
    if (report.count === 0) {
      lines.push('  status: no DSH skills yet; create one after a verified procedure')
    } else if (report.unverified.length === 0 && report.stale.length === 0 && report.overBudget.length === 0) {
      lines.push('  status: all skills verified and within budget')
    } else {
      lines.push('  action: patch or verify stale skills; move long material into references/')
    }
    return lines.join('\n')
  }

  /** Absolute paths for `/evolve paths`. */
  pathsSummary() {
    return [
      `home       ${this.home}`,
      `skills     ${this.skillsDir}`,
      `state      ${this.stateDir}`,
      `backups    ${this.backupsDir}`,
      `journal    ${this.journalPath}`,
      `hermes     ${this.hermesHome} (read-only boundary; never written)`,
    ].join('\n')
  }

  /**
   * Validate a complete SKILL.md against the caps.
   * @param {string} name - expected name.
   * @param {string} text - complete file.
   */
  #validateSkill(name, text) {
    const parsed = parseFrontmatter(text)
    if (!parsed.exists) throw new Error('SKILL.md must start with YAML frontmatter')
    if (parsed.fields.name !== name) throw new Error(`frontmatter name ${JSON.stringify(parsed.fields.name)} does not match ${name}`)
    if (typeof parsed.fields.description !== 'string' || parsed.fields.description.length === 0) throw new Error('frontmatter needs a description')
    if (parsed.fields.description.length > this.maxDescriptionChars) throw new Error(`description is over ${this.maxDescriptionChars} characters`)
    if (parsed.fields.whenToUse !== undefined && parsed.fields.whenToUse.length > this.maxWhenToUseChars) {
      throw new Error(`whenToUse is over ${this.maxWhenToUseChars} characters`)
    }
    if (parsed.body.trim().length < 20) throw new Error('SKILL.md body must contain the actual procedure')
    assertSafeText(text, 'SKILL.md', {
      maxChars: this.maxSkillChars,
      maxLines: this.maxSkillLines,
      maxLineChars: 4000,
      repeated: true,
    })
  }

  /**
   * Normalize and validate an optional references array.
   * @param {unknown} value - model-supplied references.
   * @returns {Array<{ path: string, content: string }>} normalized references.
   */
  #normalizeReferences(value) {
    if (value === undefined) return []
    if (!Array.isArray(value)) throw new Error('references must be an array of { path, content }')
    if (value.length > this.maxReferences) throw new Error(`at most ${this.maxReferences} references per create`)
    const seen = new Set()
    return value.map((item) => {
      if (item === null || typeof item !== 'object') throw new Error('each reference needs path and content')
      const path = requireResourcePath(this.skillsDir, item.path)
      if (seen.has(path)) throw new Error(`duplicate reference ${path}`)
      seen.add(path)
      if (typeof item.content !== 'string') throw new Error(`reference ${path} content must be a string`)
      assertSafeText(item.content, path, { maxChars: this.maxReferenceChars, maxLines: 8000, maxLineChars: 8000, repeated: false })
      return { path, content: item.content }
    })
  }

  /**
   * Write one resource file.
   * @param {string} targetDir - skill directory.
   * @param {{ path: string, content: string }} reference - normalized reference.
   * @returns {{ path: string, chars: number }} written reference.
   */
  #writeReference(targetDir, reference) {
    const path = requireResourcePath(targetDir, reference.path)
    assertSafeText(reference.content, path, { maxChars: this.maxReferenceChars, maxLines: 8000, maxLineChars: 8000, repeated: false })
    const destination = resolve(targetDir, path)
    this.#atomicWrite(destination, reference.content)
    return { path, chars: reference.content.length }
  }

  /**
   * Locate an existing skill by name.
   * @param {string} name - candidate name.
   * @returns {{ path: string, bundle: boolean }} located file.
   */
  #existingPath(name) {
    const valid = requireName(name)
    const bundle = join(this.skillsDir, valid, 'SKILL.md')
    if (existsSync(bundle)) return { path: bundle, bundle: true }
    const flat = join(this.skillsDir, `${valid}.md`)
    if (existsSync(flat)) return { path: flat, bundle: false }
    throw new Error(`skill ${valid} was not found in ${this.skillsDir}`)
  }

  /**
   * Read the next version from a bundle's frontmatter.
   * @param {string} targetDir - skill directory.
   * @returns {number} next version.
   */
  #nextVersion(targetDir) {
    const text = readIfPresent(join(targetDir, 'SKILL.md'))
    const match = /^\s+version:\s*(\d+)\s*$/m.exec(text)
    return match === null ? 2 : Number(match[1]) + 1
  }

  /**
   * Back up one skill before changing it.
   * @param {string} source - SKILL.md, flat file, or bundle directory.
   * @param {string} name - skill name.
   */
  #backup(source, name) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const destination = join(this.backupsDir, stamp, name)
    mkdirSync(dirname(destination), { recursive: true })
    if (statSync(source).isDirectory()) {
      cpSync(source, destination, { recursive: true, force: true })
    } else {
      copyFileSync(source, `${destination}.md`)
    }
    this.#pruneBackups()
  }

  /** Keep only the newest backup sets. */
  #pruneBackups() {
    let entries
    try {
      entries = readdirSync(this.backupsDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort()
    } catch {
      return
    }
    while (entries.length > this.maxBackupSets) {
      const oldest = entries.shift()
      rmSync(join(this.backupsDir, oldest), { recursive: true, force: true })
    }
  }

  /**
   * Write one file atomically.
   * @param {string} path - destination.
   * @param {string} text - complete text.
   */
  #atomicWrite(path, text) {
    mkdirSync(dirname(path), { recursive: true })
    const temporary = `${path}.${process.pid}.${Date.now()}.tmp`
    writeFileSync(temporary, text, 'utf8')
    try {
      renameSync(temporary, path)
    } catch (error) {
      try {
        rmSync(path, { force: true })
        renameSync(temporary, path)
      } catch {
        try {
          rmSync(temporary, { force: true })
        } catch {
          // The original error is the useful one.
        }
        throw error
      }
    }
  }

  /**
   * Persist one verification record tied to the exact body hash.
   * @param {string} name - skill name.
   * @param {string} path - skill file.
   * @param {string} text - current body.
   * @param {string} evidence - successful test.
   */
  #recordVerified(name, path, text, evidence) {
    mkdirSync(this.verifiedDir, { recursive: true })
    writeFileSync(
      join(this.verifiedDir, `${name}.json`),
      `${JSON.stringify({ name, path, sha256: digest(text), at: new Date().toISOString(), evidence }, null, 2)}\n`,
      'utf8',
    )
  }

  /**
   * Read one verification record.
   * @param {string} name - skill name.
   * @returns {{ sha256: string, at: string, evidence: string } | null} record.
   */
  #readVerified(name) {
    try {
      const value = JSON.parse(readFileSync(join(this.verifiedDir, `${name}.json`), 'utf8'))
      if (typeof value.sha256 !== 'string' || typeof value.at !== 'string') return null
      return value
    } catch {
      return null
    }
  }

  /**
   * Remove one verification record.
   * @param {string} name - skill name.
   */
  #removeVerified(name) {
    try {
      rmSync(join(this.verifiedDir, `${name}.json`), { force: true })
    } catch {
      // Advisory only.
    }
  }

  /**
   * Append one audit line, rotating a large journal once.
   * @param {Record<string, unknown>} record - journal record.
   */
  #journal(record) {
    if (!this.journal) return
    try {
      mkdirSync(dirname(this.journalPath), { recursive: true })
      if (existsSync(this.journalPath) && statSync(this.journalPath).size > this.maxJournalBytes) {
        const previous = join(dirname(this.journalPath), 'journal.1.jsonl')
        rmSync(previous, { force: true })
        renameSync(this.journalPath, previous)
      }
      appendFileSync(this.journalPath, `${JSON.stringify({ at: new Date().toISOString(), ...record })}\n`, 'utf8')
    } catch {
      // The journal is advisory; the skill files are the source of truth.
    }
  }

  /**
   * Count files and characters below one directory.
   * @param {string} root - directory.
   * @returns {{ sets: number, chars: number }} stats.
   */
  #directoryStats(root) {
    let sets = 0
    let chars = 0
    const walk = (path, depth) => {
      let entries
      try {
        entries = readdirSync(path, { withFileTypes: true })
      } catch {
        return
      }
      for (const entry of entries) {
        const full = join(path, entry.name)
        if (entry.isDirectory()) {
          if (depth === 0) sets += 1
          walk(full, depth + 1)
        } else if (entry.isFile()) {
          try {
            chars += statSync(full).size
          } catch {
            // Ignore unreadable backup files in the audit total.
          }
        }
      }
    }
    walk(root, 0)
    return { sets, chars }
  }

  /**
   * Build one successful result.
   * @param {string} action - action name.
   * @param {string} name - skill name.
   * @param {string} path - file path.
   * @param {string} text - file text.
   * @param {string} note - extra guidance.
   * @returns {Record<string, unknown>} result.
   */
  #result(action, name, path, text, note) {
    const lines = text.split(/\r?\n/).length
    return {
      ok: true,
      action,
      name,
      path,
      chars: text.length,
      lines,
      summary: `${action} ${name} — ${path} (${text.length} chars, ${lines} lines; ${note})`,
    }
  }

  /**
   * Serialize read-modify-write cycles.
   * @template T
   * @param {() => T} run - cycle body.
   * @returns {Promise<T>} result.
   */
  #exclusive(run) {
    const result = this.chain.then(() => run())
    this.chain = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }
}

/**
 * Read a positive integer bound.
 * @param {unknown} value - configured value.
 * @param {number} fallback - default.
 * @returns {number} effective bound.
 */
function bound(value, fallback) {
  return Number.isSafeInteger(value) && value > 0 ? value : fallback
}
