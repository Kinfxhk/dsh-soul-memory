import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { evolveCommand } from '../evolve.js'
import { SkillBook } from '../skills.js'

const root = mkdtempSync(join(tmpdir(), 'soul-evolve-'))
const book = new SkillBook({ home: join(root, 'home'), hermesHome: join(root, 'hermes'), journal: false })
book.ensureHome()
await book.create({
  name: 'probe-skill',
  description: 'Use when a probe must prove the wiring.',
  body: '# Probe\n\n1. Run the probe.\n',
  evidence: 'Ran the probe and observed the expected result.',
})
after(() => rmSync(root, { recursive: true, force: true }))

test('bare /evolve lists skills and verification state', () => {
  const result = evolveCommand(book, '')
  assert.equal(result.kind, 'success')
  assert.match(result.text, /probe-skill/)
  assert.match(result.text, /verified/)
})

test('/evolve audit reports the memory budget and paths', () => {
  assert.match(evolveCommand(book, 'audit').text, /Evolution audit/)
  assert.match(evolveCommand(book, 'audit').text, /memory: USER\.md 0 \+ MEMORY\.md 0 \/ 12000/)
  assert.match(evolveCommand(book, 'paths').text, /hermes .*read-only boundary/)
})

test('/evolve skill shows one body and unknown arguments fail', () => {
  const shown = evolveCommand(book, 'skill probe-skill')
  assert.equal(shown.kind, 'success')
  assert.match(shown.text, /Run the probe/)
  assert.equal(evolveCommand(book, 'nope').kind, 'error')
})
