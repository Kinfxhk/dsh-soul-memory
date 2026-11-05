import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { SkillBook } from '../skills.js'

const root = mkdtempSync(join(tmpdir(), 'soul-skill-'))
after(() => rmSync(root, { recursive: true, force: true }))

let counter = 0

/** One isolated skill home per test. */
function fresh(options = {}) {
  counter += 1
  const home = join(root, `case-${counter}`)
  const book = new SkillBook({ home, hermesHome: join(root, 'hermes'), ...options })
  book.ensureHome()
  return { book, home }
}

const CREATE = {
  name: 'probe-skill',
  description: 'Use when a probe must prove the wiring.',
  whenToUse: 'A probe is needed before trusting a new integration.',
  body: '# Probe\n\n1. Run the probe.\n2. Check the exit code.\n',
  evidence: 'Ran the probe twice; exit 0 and the expected output appeared.',
}

test('create writes a discoverable bundle with verifiable frontmatter', async () => {
  const { book } = fresh()
  const result = await book.create(CREATE)
  assert.equal(result.ok, true)
  const path = join(book.skillsDir, 'probe-skill', 'SKILL.md')
  assert.equal(existsSync(path), true)
  const text = readFileSync(path, 'utf8')
  assert.match(text, /^---\nname: probe-skill\n/)
  assert.match(text, /description: "Use when a probe must prove the wiring\."/)
  assert.match(text, /metadata:\n  origin: dsh-evolve/)
  assert.match(text, /# Probe/)

  const rows = book.list()
  assert.equal(rows.length, 1)
  assert.equal(rows[0].name, 'probe-skill')
  assert.equal(rows[0].verified, true)
  assert.equal(rows[0].stale, false)

  const read = book.read('probe-skill')
  assert.match(read.content, /Run the probe/)
})

test('create refuses oversized, repetitive, secret, and badly named content', async () => {
  const { book } = fresh()
  await assert.rejects(
    () => book.create({ ...CREATE, body: `${'A'.repeat(5000)}\n` }),
    /character line|characters|lines/,
  )
  await assert.rejects(
    () => book.create({ ...CREATE, name: 'Bad Name' }),
    /kebab-case/,
  )
  await assert.rejects(
    () => book.create({ ...CREATE, body: '# Dump\n\n' + Array.from({ length: 60 }, () => 'identical line').join('\n') }),
    /repeated dump/,
  )
  await assert.rejects(
    () => book.create({ ...CREATE, body: '# Key\n\nsk-aaaaaaaaaaaaaaaaaaaaaaaa' }),
    /credential/,
  )

  const { book: small } = fresh({ maxSkillChars: 800 })
  await assert.rejects(
    () => small.create({ ...CREATE, body: `# Small\n\n${'A'.repeat(900)}\n` }),
    /cap is 800/,
  )
  assert.equal(book.list().length, 0)
  assert.equal(small.list().length, 0)
})

test('create requires evidence that the procedure was tested', async () => {
  const { book } = fresh()
  await assert.rejects(() => book.create({ ...CREATE, evidence: 'short' }), /evidence/)
  await assert.rejects(() => book.create({ ...CREATE, evidence: undefined }), /evidence/)
})

test('patch replaces one exact substring, backs up, and re-verifies', async () => {
  const { book } = fresh()
  await book.create(CREATE)
  const path = join(book.skillsDir, 'probe-skill', 'SKILL.md')
  const before = readFileSync(path, 'utf8')

  await book.patch({
    name: 'probe-skill',
    old_text: '1. Run the probe.',
    content: '1. Run the probe twice.',
    evidence: 'Ran the patched procedure twice; both runs passed.',
  })

  const after = readFileSync(path, 'utf8')
  assert.notEqual(after, before)
  assert.match(after, /Run the probe twice/)
  const backups = readdirSync(join(book.stateDir, 'backups'), { withFileTypes: true })
  assert.ok(backups.some((entry) => entry.isDirectory()))
  assert.equal(book.list()[0].verified, true)

  await assert.rejects(
    () => book.patch({ name: 'probe-skill', old_text: 'not present', content: 'x', evidence: 'Ran a validation pass and it failed.' }),
    /not found/,
  )
})

test('an out-of-band edit invalidates evidence and verify restores it', async () => {
  const { book } = fresh()
  await book.create(CREATE)
  const path = join(book.skillsDir, 'probe-skill', 'SKILL.md')
  const text = readFileSync(path, 'utf8')
  writeFileSync(path, text.replace('Check the exit code.', 'Check the exit code and the log.'))

  let audit = book.audit()
  assert.deepEqual(audit.unverified, ['probe-skill'])

  await book.verify({ name: 'probe-skill', evidence: 'Re-ran after the edit; output and log both matched.' })
  audit = book.audit()
  assert.deepEqual(audit.unverified, [])
})

test('archive removes a skill from the catalog and keeps a copy', async () => {
  const { book } = fresh()
  await book.create(CREATE)
  const result = await book.archive('probe-skill')
  assert.equal(book.list().length, 0)
  assert.equal(existsSync(result.path), true)
  const backups = readdirSync(join(book.stateDir, 'backups'), { withFileTypes: true })
  assert.ok(backups.length > 0)
})

test('references stay inside the bundle and carry the anti-bloat caps', async () => {
  const { book } = fresh({ maxReferenceChars: 40 })
  await book.create(CREATE)

  await assert.rejects(
    () => book.reference({ name: 'probe-skill', reference_path: '../escape.md', reference_content: 'x', evidence: 'Validated a reference write.' }),
    /escapes/,
  )
  await assert.rejects(
    () => book.reference({ name: 'probe-skill', reference_path: 'references/notes.md', reference_content: 'x'.repeat(50), evidence: 'Validated a reference write.' }),
    /cap is 40/,
  )

  await book.reference({ name: 'probe-skill', reference_path: 'references/notes.md', reference_content: '# Notes\n\nshort\n', evidence: 'Validated a reference write.' })
  assert.equal(existsSync(join(book.skillsDir, 'probe-skill', 'references', 'notes.md')), true)
})

test('flat skill files are readable and patchable', async () => {
  const { book } = fresh()
  const path = join(book.skillsDir, 'legacy-skill.md')
  writeFileSync(path, '---\nname: legacy-skill\ndescription: "Use when legacy."\n---\n\n# Legacy\n\nRun the old step.\n')
  const rows = book.list()
  assert.equal(rows.length, 1)
  assert.equal(rows[0].bundle, false)
  await book.patch({ name: 'legacy-skill', old_text: 'Run the old step.', content: 'Run the new step.', evidence: 'Ran the new step; it succeeded.' })
  assert.match(readFileSync(path, 'utf8'), /Run the new step/)
})

test('audit reports memory budget, unverified skills, and caps', async () => {
  const { book, home } = fresh({ maxSkillChars: 500, memoryBudget: 1000 })
  await book.create({ ...CREATE, body: '# Probe\n\n1. Run the probe.\n2. Check the exit code.\n' })
  mkdirSync(join(home, 'memories'), { recursive: true })
  writeFileSync(join(home, 'memories', 'USER.md'), 'u'.repeat(100))
  writeFileSync(join(home, 'memories', 'MEMORY.md'), 'm'.repeat(200))

  const audit = book.audit()
  assert.equal(audit.memory.userChars, 100)
  assert.equal(audit.memory.memoryChars, 200)
  assert.equal(audit.memory.budget, 1000)
  assert.match(book.auditSummary(), /memory: USER\.md 100 \+ MEMORY\.md 200 \/ 1000/)
})

test('line and description caps are enforced', async () => {
  const { book } = fresh({ maxSkillLines: 40, maxDescriptionChars: 30 })
  await assert.rejects(
    () => book.create({ ...CREATE, description: 'd'.repeat(31) }),
    /cap is 30/,
  )
  await assert.rejects(
    () => book.create({ ...CREATE, description: 'Probe.', body: '# Many\n\n' + Array.from({ length: 60 }, (_, index) => `step ${index}`).join('\n') }),
    /lines; the cap is 40/,
  )
  assert.equal(book.list().length, 0)
})

test('create can write resource files in the same atomic bundle call', async () => {
  const { book } = fresh()
  await book.create({
    ...CREATE,
    references: [{ path: 'references/notes.md', content: '# Notes\n\nLong detail lives here.\n' }],
  })
  assert.equal(existsSync(join(book.skillsDir, 'probe-skill', 'references', 'notes.md')), true)
  assert.match(readFileSync(join(book.skillsDir, 'probe-skill', 'SKILL.md'), 'utf8'), /Run the probe/)
})

test('a DSH root inside the Hermes home is refused', () => {
  const hermes = join(root, 'hermes-store')
  assert.throws(() => new SkillBook({ home: hermes, hermesHome: hermes }), /inside the Hermes home/)
})
