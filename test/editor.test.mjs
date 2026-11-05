import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { createEditorHandler } from '../editor.js'
import { SkillBook } from '../skills.js'
import { Notes } from '../store.js'

const root = mkdtempSync(join(tmpdir(), 'soul-editor-'))
const home = join(root, 'home')
const notes = new Notes({ home, journal: false })
notes.ensureHome()
const book = new SkillBook({ home, hermesHome: join(root, 'hermes'), journal: false })
book.ensureHome()

const server = createServer((req, res) => {
  void createEditorHandler({ notes, book })(req, res)
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const address = server.address()
const base = `http://127.0.0.1:${address.port}/soul-memory`

after(() => {
  server.close()
  rmSync(root, { recursive: true, force: true })
})

test('GET /api/state reports the three files and budgets', async () => {
  const response = await fetch(`${base}/api/state`)
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.ok, true)
  assert.deepEqual(body.files.map((file) => file.target), ['soul', 'user', 'memory'])
  assert.equal(body.files[0].budget, 8000)
  assert.equal(body.files[1].budget, 12000)
  assert.equal(body.memory.budget, 12000)
})

test('GET and POST /api/file edit SOUL.md through the user path', async () => {
  const empty = await (await fetch(`${base}/api/file?target=soul`)).json()
  assert.equal(empty.ok, true)
  assert.equal(empty.content, '')

  const saved = await (await fetch(`${base}/api/file`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ target: 'soul', content: '# Soul\n\nBe concise.\n' }),
  })).json()
  assert.equal(saved.ok, true)
  assert.equal(saved.result.action, 'set')

  const read = await (await fetch(`${base}/api/file?target=soul`)).json()
  assert.match(read.content, /Be concise/)
  assert.match(notes.read('soul').content, /Be concise/)
})

test('POST /api/file rejects unknown targets, missing content, and non-JSON bodies', async () => {
  const badTarget = await fetch(`${base}/api/file`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ target: '../SOUL.md', content: 'x' }),
  })
  assert.equal(badTarget.status, 400)

  const badContent = await fetch(`${base}/api/file`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ target: 'memory', content: 7 }),
  })
  assert.equal(badContent.status, 400)

  const badType = await fetch(`${base}/api/file`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: JSON.stringify({ target: 'memory', content: 'x' }),
  })
  assert.equal(badType.status, 415)
})

test('GET /api/skills exposes the user-level skill catalog', async () => {
  const body = await (await fetch(`${base}/api/skills`)).json()
  assert.equal(body.ok, true)
  assert.deepEqual(body.skills, [])
  assert.match(body.summary, /no DSH skills yet/)
})
