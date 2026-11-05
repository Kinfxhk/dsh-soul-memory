import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { Notes } from '../store.js'

const root = mkdtempSync(join(tmpdir(), 'soul-memory-'))
after(() => rmSync(root, { recursive: true, force: true }))

let counter = 0

/** One isolated data root per test. */
function fresh(options = {}) {
  counter += 1
  return new Notes({ home: join(root, `case-${counter}`), journal: true, ...options })
}

test('empty notes contribute nothing to the prompt', () => {
  const notes = fresh()
  notes.ensureHome()
  assert.equal(notes.promptSoul(), '')
  assert.equal(notes.promptMemory(), '')
  assert.equal(notes.summary().notFound, true)
})

test('SOUL.md becomes the identity section', () => {
  const notes = fresh()
  notes.ensureHome()
  writeFileSync(notes.paths.soul, 'Be terse. Prefer Cantonese.\n', 'utf8')
  assert.equal(notes.promptSoul(), '## Soul\n\nBe terse. Prefer Cantonese.')
})

test('add appends markdown entries and renders both memory files', async () => {
  const notes = fresh()
  notes.ensureHome()
  await notes.add('user', 'Name: Alex')
  await notes.add('user', 'Prefers short answers.\nAvoid emoji.')
  await notes.add('memory', 'Workspace is C:\\Users\\example\\Documents')

  assert.equal(
    readFileSync(notes.paths.user, 'utf8'),
    '- Name: Alex\n\n- Prefers short answers.\n  Avoid emoji.\n',
  )
  assert.equal(notes.promptMemory(), [
    '## User profile',
    '',
    '- Name: Alex',
    '',
    '- Prefers short answers.',
    '  Avoid emoji.',
    '',
    '## Long-term memory',
    '',
    '- Workspace is C:\\Users\\example\\Documents',
  ].join('\n'))
})

test('replace swaps one unique substring and rejects ambiguous or missing needles', async () => {
  const notes = fresh()
  notes.ensureHome()
  await notes.add('user', 'Name: Alex')
  await notes.add('user', 'Name: old alias')
  await assert.rejects(() => notes.replace('user', 'Name:', 'Called:'), /matches 2 places/)
  await assert.rejects(() => notes.replace('user', 'nothing here', 'x'), /not found/)
  await notes.replace('user', '- Name: Alex', '- Name: Alex (they/them)')
  assert.match(readFileSync(notes.paths.user, 'utf8'), /- Name: Alex \(they\/them\)/)
})

test('remove deletes one unique substring and tidies blank lines', async () => {
  const notes = fresh()
  notes.ensureHome()
  await notes.add('memory', 'first')
  await notes.add('memory', 'second')
  await notes.remove('memory', '- first')
  assert.equal(readFileSync(notes.paths.memory, 'utf8'), '- second\n')
})

test('removing an entry by its text leaves no dangling list marker', async () => {
  const notes = fresh()
  notes.ensureHome()
  await notes.add('user', 'keep me')
  await notes.add('user', 'delete me')
  await notes.remove('user', 'delete me')
  assert.equal(readFileSync(notes.paths.user, 'utf8'), '- keep me\n')
})

test('SOUL.md refuses writes but allows reads', async () => {
  const notes = fresh()
  notes.ensureHome()
  writeFileSync(notes.paths.soul, 'I am a careful assistant.\n', 'utf8')
  await assert.rejects(() => notes.add('soul', 'nope'), /SOUL\.md is owned by the user/)
  assert.match(notes.read('soul').content, /careful assistant/)
})

test('writes past the file cap are rejected before touching disk', async () => {
  const notes = fresh({ maxFileChars: 40 })
  notes.ensureHome()
  await assert.rejects(() => notes.add('memory', 'x'.repeat(60)), /over the 40 limit/)
  assert.throws(() => readFileSync(notes.paths.memory, 'utf8'))
})

test('injected memory is truncated at maxMemoryChars with a pointer', async () => {
  const notes = fresh({ maxMemoryChars: 60 })
  notes.ensureHome()
  await notes.add('user', 'A'.repeat(80))
  const text = notes.promptMemory()
  assert.equal(text, `${'## User profile\n\n- ' + 'A'.repeat(80)}`.slice(0, 60).trimEnd() + `\n\n[Memory truncated at 60 characters; files: ${notes.home}]`)
  assert.match(text, /Memory truncated at 60 characters/)
})

test('memory nearing the injection budget warns to consolidate', async () => {
  const notes = fresh({ maxMemoryChars: 1000 })
  notes.ensureHome()
  await notes.add('user', 'A'.repeat(850))
  const text = notes.promptMemory()
  assert.match(text, /Memory is at \d+ \/ 1000 characters; consolidate stale entries/)
})

test('every write appends one journal line', async () => {
  const notes = fresh()
  notes.ensureHome()
  await notes.add('user', 'one')
  await notes.replace('user', 'one', 'two')
  const lines = readFileSync(notes.journalPath, 'utf8').trim().split('\n')
  assert.equal(lines.length, 2)
  assert.deepEqual(JSON.parse(lines[0]).action, 'add')
  assert.deepEqual(JSON.parse(lines[1]).action, 'replace')
})

test('prompt rendering picks up edits made outside the plugin', () => {
  const notes = fresh()
  notes.ensureHome()
  writeFileSync(notes.paths.soul, 'first voice\n', 'utf8')
  assert.match(notes.promptSoul(), /first voice/)
  writeFileSync(notes.paths.soul, 'second voice, longer than the first\n', 'utf8')
  assert.match(notes.promptSoul(), /second voice/)
})

test('set replaces a whole file, backs up the old text, and may write SOUL', async () => {
  const notes = fresh()
  notes.ensureHome()
  await notes.set('soul', '# Soul\n\nBe concise.\n')
  assert.match(notes.read('soul').content, /Be concise/)

  await notes.set('soul', '# Soul\n\nBe direct.\n')
  assert.match(notes.read('soul').content, /Be direct/)
  const backups = readdirSync(join(notes.home, '.backups'))
  assert.ok(backups.some((name) => name.startsWith('soul-')))
})

test('set rejects a whole file over the file cap', async () => {
  const notes = fresh({ maxFileChars: 40 })
  notes.ensureHome()
  await assert.rejects(() => notes.set('user', 'x'.repeat(50)), /cap is 40/)
  assert.equal(notes.read('user').chars, 0)
})

test('paths follow the configured home and file names', () => {
  const notes = fresh({ home: join(root, 'custom'), userFile: 'people/me.md' })
  assert.equal(notes.paths.user, join(root, 'custom', 'people', 'me.md'))
  assert.equal(notes.journalPath, join(root, 'custom', 'people', 'journal.jsonl'))
  assert.equal(notes.paths.soul, join(root, 'custom', 'SOUL.md'))
})
