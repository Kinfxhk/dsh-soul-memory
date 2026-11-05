import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { apply } from '../index.js'

const root = mkdtempSync(join(tmpdir(), 'soul-memory-index-'))
after(() => rmSync(root, { recursive: true, force: true }))

let counter = 0

/** Register the plugin against a recording context. */
function harness(options = {}) {
  counter += 1
  const sections = []
  const contexts = []
  const tools = []
  const commands = []
  const routes = []
  apply(
    {
      systemPrompt: {
        section: (section) => sections.push(section),
        context: (context) => contexts.push(context),
      },
      tools: { register: (tool) => tools.push(tool) },
      commands: { register: (command) => commands.push(command) },
      inject(names, callback) {
        assert.deepEqual(names, ['webServer'])
        return callback({
          webServer: { register(route) { routes.push(route); return () => {} } },
          effect(callback) { return callback() },
        })
      },
      effect(callback) { return callback() },
    },
    { home: join(root, `case-${counter}`), journal: false, ...options },
  )
  return { sections, contexts, tools, commands, routes }
}

test('registers the soul, memory context, maintenance, and evolution contracts', () => {
  const { sections, contexts, tools, commands, routes } = harness()
  assert.deepEqual(sections.map((section) => section.name), ['soul:identity', 'soul:maintenance', 'soul:evolution'])
  assert.equal(sections[1].order, 1030)
  assert.equal(sections[2].order, 1035)
  assert.match(sections[1].text(), /Before finishing a task that produced a durable fact/)
  assert.match(sections[2].text(), /Self-evolution \(DSH\)/)
  assert.equal(routes[0].path, '/soul-memory')
  assert.equal(typeof routes[0].handler, 'function')
  assert.match(sections[2].text(), /never read, copy, or write them from here/)
  assert.equal(contexts[0].name, 'soul:memory')
  assert.equal(contexts[0].required, true)
  assert.deepEqual(tools.map((tool) => tool.name), ['memory', 'evolve'])
  assert.deepEqual(commands.map((command) => command.name), ['memory', 'evolve'])
  assert.deepEqual(tools[1].parameters.properties.action.enum, ['list', 'read', 'create', 'patch', 'verify', 'reference', 'archive', 'audit'])
})

test('maintenance: false omits only the review contract', () => {
  const { sections, contexts, tools } = harness({ maintenance: false })
  assert.deepEqual(sections.map((section) => section.name), ['soul:identity', 'soul:evolution'])
  assert.equal(contexts[0].name, 'soul:memory')
  assert.deepEqual(tools.map((tool) => tool.name), ['memory', 'evolve'])
})

test('evolution: false omits only the skill contract', () => {
  const { sections, tools } = harness({ evolution: false })
  assert.deepEqual(sections.map((section) => section.name), ['soul:identity', 'soul:maintenance'])
  assert.deepEqual(tools.map((tool) => tool.name), ['memory', 'evolve'])
})

test('the evolve tool creates, lists, and reads a skill', async () => {
  const { tools } = harness()
  const evolve = tools.find((tool) => tool.name === 'evolve')
  const created = await evolve.execute({
    action: 'create',
    name: 'wiring-probe',
    description: 'Use when the evolve wiring must be proven.',
    body: '# Wiring probe\n\n1. Create this skill.\n2. Read it back.\n',
    evidence: 'Created and read the skill; both calls returned ok.',
  })
  assert.equal(created.ok, true)

  const listed = await evolve.execute({ action: 'list' })
  assert.match(listed.summary, /wiring-probe/)

  const read = await evolve.execute({ action: 'read', name: 'wiring-probe' })
  assert.match(read.content, /Create this skill/)
})
