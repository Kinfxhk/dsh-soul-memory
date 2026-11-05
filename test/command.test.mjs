import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { memoryCommand } from '../command.js'
import { Notes } from '../store.js'

const root = mkdtempSync(join(tmpdir(), 'soul-memory-command-'))
after(() => rmSync(root, { recursive: true, force: true }))

function fresh(options = {}) {
  return new Notes({ home: join(root, `case-${Math.random().toString(36).slice(2)}`), ...options })
}

test('bare /memory lists the files and their roles', async () => {
  const notes = fresh()
  notes.ensureHome()
  writeFileSync(notes.paths.soul, 'Be direct.\n', 'utf8')
  await notes.add('user', 'Name: Alex')
  const result = memoryCommand(notes, '')
  assert.equal(result.kind, 'success')
  assert.match(result.text, /Soul & Memory — /)
  assert.match(result.text, /SOUL\.md\s+SOUL\.md\s+\d+ chars\s+identity → system prompt/)
  assert.match(result.text, /USER\.md\s+memories[\\/]USER\.md\s+\d+ chars\s+user profile → session context/)
  assert.match(result.text, /missing/)
})

test('/memory soul shows the file and the ownership hint', () => {
  const notes = fresh()
  notes.ensureHome()
  writeFileSync(notes.paths.soul, 'Warm, concise, bilingual.\n', 'utf8')
  const result = memoryCommand(notes, 'soul')
  assert.equal(result.kind, 'success')
  assert.match(result.text, /soul\.md — .*SOUL\.md \(\d+ chars\)/)
  assert.match(result.text, /Warm, concise, bilingual\./)
  assert.match(result.text, /injected as the first prompt section/)
})

test('/memory paths lists absolute paths including the journal', () => {
  const notes = fresh()
  notes.ensureHome()
  const result = memoryCommand(notes, 'paths')
  assert.equal(result.kind, 'success')
  assert.match(result.text, new RegExp(notes.paths.memory.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(result.text, /journal\.jsonl/)
})

test('an unknown argument is an error with usage', () => {
  const result = memoryCommand(fresh(), 'banana')
  assert.equal(result.kind, 'error')
  assert.match(result.text, /Usage: \/memory \[soul\|user\|memory\|paths\]/)
})

test('a long file is truncated in the reply', async () => {
  const notes = fresh({ maxEntryChars: 7000 })
  notes.ensureHome()
  await notes.add('memory', 'x'.repeat(6000))
  const result = memoryCommand(notes, 'memory')
  assert.ok(result.text.length < 6500)
  assert.match(result.text, /Truncated at 6000 characters/)
})
