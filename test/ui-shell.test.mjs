import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import vm from 'node:vm'

const root = join(import.meta.dirname, '..')
function theme() {
  const path = join(root, 'client.ui-shell.js')
  assert.ok(existsSync(path), 'the independently loadable theme chunk must exist')
  let registration
  vm.runInNewContext(readFileSync(path, 'utf8'), { window: { __ModuleLoader__: { load: value => { registration = value } } } })
  assert.equal(registration.id, '@local/dsh-soul-memory/client.ui-shell.js')
  return registration.factory()
}

test('theme owns one removable stylesheet without modifying application attributes', () => {
  const module = theme()
  const nodes = []
  const document = {
    createElement(tag) {
      assert.equal(tag, 'style')
      return { setAttribute(k,v) { this[k] = v }, remove() { nodes.splice(nodes.indexOf(this), 1) } }
    },
    head: { appendChild(node) { nodes.push(node) } },
  }
  const dispose = module.mount(document)
  assert.equal(nodes.length, 1)
  assert.equal(nodes[0]['data-plugin'], '@local/dsh-soul-memory')
  assert.match(nodes[0].textContent, /data-ds-dark-theme/)
  dispose()
  assert.equal(nodes.length, 0)
})

async function clientEffect() {
  let registration, component
  const effects = []
  const React = {
    createElement: () => null, Fragment: Symbol(),
    useState: () => [false, () => {}], useEffect: f => { effects.push(f) },
  }
  vm.runInNewContext(readFileSync(join(root, 'client.js'), 'utf8'), {
    window: { __ModuleLoader__: { load: r => { registration = r } } },
    document: {}, console,
  })
  const requested = []
  let resolveChunk, mounted = 0, removed = 0
  const require = name => { assert.equal(name, 'react'); return React }
  require.async = spec => {
    requested.push(spec)
    return new Promise(resolve => { resolveChunk = resolve })
  }
  const module = registration.factory(require)
  module.apply({ slots: { inject: (_, install) => install(), register: (_, c) => { component = c } } })
  component()
  const cleanups = effects.map(effect => effect()).filter(c => typeof c === 'function')
  return {
    requested,
    finish: async () => {
      resolveChunk({ mount: () => { mounted++; return () => { removed++ } } })
      await Promise.resolve(); await Promise.resolve()
    },
    cleanup: () => cleanups.forEach(c => c()),
    counts: () => [mounted, removed],
  }
}

test('existing overlay loads package-local theme once and disposes it', async () => {
  const client = await clientEffect()
  assert.deepEqual(client.requested, ['./client.ui-shell.js'])
  await client.finish()
  assert.deepEqual(client.counts(), [1, 0])
  client.cleanup()
  assert.deepEqual(client.counts(), [1, 1])
})

test('late theme chunk does not mount after the overlay is removed', async () => {
  const client = await clientEffect()
  assert.deepEqual(client.requested, ['./client.ui-shell.js'])
  client.cleanup()
  await client.finish()
  assert.deepEqual(client.counts(), [0, 0])
})
