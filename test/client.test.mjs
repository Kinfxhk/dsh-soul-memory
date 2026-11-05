import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import vm from 'node:vm'

const source = readFileSync(join(import.meta.dirname, '..', 'client.js'), 'utf8')

/** Load the browser module against a recording window and minimal hook runtime. */
function load({ document } = {}) {
  let definition
  let active
  const listeners = new Map()
  const window = {
    Event,
    addEventListener(name, listener) {
      if (!listeners.has(name)) listeners.set(name, new Set())
      listeners.get(name).add(listener)
    },
    removeEventListener(name, listener) {
      listeners.get(name)?.delete(listener)
    },
    dispatchEvent(event) {
      for (const listener of listeners.get(event.type) ?? []) listener(event)
      return true
    },
    __ModuleLoader__: {
      load(value) {
        definition = value
      },
    },
  }
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    Fragment: Symbol('Fragment'),
    useState(initial) {
      const instance = active
      const index = instance.cursor++
      if (!(index in instance.hooks)) {
        instance.hooks[index] = typeof initial === 'function' ? initial() : initial
      }
      return [instance.hooks[index], value => {
        instance.hooks[index] = typeof value === 'function' ? value(instance.hooks[index]) : value
        instance.stateWrites++
      }]
    },
    useEffect(effect, deps) {
      const instance = active
      const index = instance.cursor++
      const previous = instance.hooks[index]
      if (!previous || !deps || deps.some((value, offset) => !Object.is(value, previous.deps[offset]))) {
        instance.effects.push(() => {
          previous?.cleanup?.()
          instance.hooks[index] = { deps, cleanup: effect() }
        })
      }
    },
    useRef(initial) {
      const index = active.cursor++
      if (!(index in active.hooks)) active.hooks[index] = { current: initial }
      return active.hooks[index]
    },
  }
  const context = { window, Event, console, setTimeout, clearTimeout, fetch: () => Promise.reject(new Error('no network in test')) }
  if (document !== undefined) context.document = document
  vm.runInNewContext(source, context)
  assert.equal(definition.id, '@local/dsh-soul-memory')
  const require = (name) => {
    if (name === 'react') return React
    throw new Error(`unexpected module ${name}`)
  }
  // Theme loading is an unrelated async boundary, held pending in these component tests.
  require.async = () => new Promise(() => {})
  const module = definition.factory(require)
  const registrations = []
  module.apply({
    slots: {
      inject(scope, install) {
        install()
        registrations.at(-1).scope = scope
      },
      register(options, component) {
        registrations.push({ options, component })
      },
    },
  })
  function mount(component) {
    const instance = { hooks: [], cursor: 0, effects: [], tree: null, stateWrites: 0 }
    instance.render = () => {
      instance.cursor = 0
      active = instance
      instance.tree = component()
      active = undefined
      for (const effect of instance.effects.splice(0)) effect()
      return instance.tree
    }
    instance.unmount = () => {
      for (const hook of instance.hooks) hook?.cleanup?.()
    }
    instance.render()
    return instance
  }
  return { module, window, registrations, mount, listeners }
}

function find(tree, predicate) {
  if (!tree || typeof tree !== 'object') return undefined
  if (predicate(tree)) return tree
  for (const child of tree.props?.children?.flat(Infinity) ?? []) {
    const match = find(child, predicate)
    if (match) return match
  }
}

const named = name => node => node.type?.name === name

test('the client module registers the modal editor in shell.overlay', () => {
  const { module, registrations } = load()
  assert.equal(module.inject.length, 1)
  assert.equal(module.inject[0], 'slots')
  const overlay = registrations.find(entry => entry.options.name === 'shell.overlay')
  assert.ok(overlay)
  assert.equal(overlay.scope, 'shell.overlay')
  assert.equal(overlay.options.id, 'soul-memory-editor')
  assert.equal(overlay.options.order, 95)
})

test('native settings section opens the existing overlay editor and removes its open listener', () => {
  const { registrations, mount, window, listeners } = load()
  const section = registrations.find(entry => entry.options.name === 'settings.section')
  assert.ok(section, 'registers the native settings section')
  assert.equal(section.scope, 'settings.section')
  assert.equal(section.options.id, 'soul-memory')
  assert.equal(section.options.order, 30)
  const label = section.options.label
  assert.equal(typeof label === 'function' ? label() : label, '全域 Soul / User / Memory')

  const root = mount(registrations.find(entry => entry.options.name === 'shell.overlay').component)
  assert.equal(find(root.tree, named('Editor')), undefined)
  const settings = mount(section.component)
  const button = find(settings.tree, node => node.type === 'button')
  assert.ok(button, 'offers an editor button')
  assert.equal(button.props.type, 'button')
  button.props.onClick()
  root.render()
  const editor = find(root.tree, named('Editor'))
  assert.ok(editor, 'settings button opens the existing Editor in Root')
  editor.props.onClose()
  root.render()
  assert.equal(find(root.tree, named('Editor')), undefined)

  assert.equal(listeners.get('dsh:soul-memory-open')?.size, 1)
  settings.unmount()
  root.unmount()
  assert.equal(listeners.get('dsh:soul-memory-open')?.size, 0)
  const writes = root.stateWrites
  window.dispatchEvent(new Event('dsh:soul-memory-open'))
  assert.equal(root.stateWrites, writes, 'disposed editor receives no open event')
})

test('left sidebar compact action dispatches the existing event and opens the same Editor', () => {
  const { registrations, mount, window } = load()
  const action = registrations.find(entry => entry.options.name === 'sidebar.footer.action')
  assert.ok(action, 'global editor has a left-sidebar launcher')
  assert.equal(action.scope, 'sidebar.footer.action')
  assert.equal(action.options.id, 'soul-memory-editor')
  assert.equal(action.options.order, 30)
  const label = action.options.label
  assert.equal(typeof label === 'function' ? label() : label, '全域 Soul / User / Memory')
  const root = mount(registrations.find(entry => entry.options.name === 'shell.overlay').component)
  const sidebar = mount(action.component)
  const button = find(sidebar.tree, node => node.type === 'button')
  assert.ok(button)
  assert.equal(button.props.type, 'button')
  assert.equal(button.props.title, '全域 Soul / User / Memory')
  assert.equal(button.props['aria-label'], '全域 Soul / User / Memory')
  assert.equal(button.props['aria-haspopup'], 'dialog')
  assert.equal(button.props.className, 'sm-sidebar-action')
  assert.ok(find(button, named('PenIcon')), 'compact action has an icon')
  assert.equal(button.props.children.some(child => typeof child === 'string'), false, 'no wide text on compact rail')
  let opens = 0
  window.addEventListener('dsh:soul-memory-open', () => opens++)
  button.props.onClick()
  root.render()
  assert.equal(opens, 1)
  const editor = find(root.tree, named('Editor'))
  assert.ok(editor)
  button.props.onClick()
  root.render()
  assert.equal(find(root.tree, named('Editor')).type, editor.type, 'repeated click reuses Editor')
  assert.equal(opens, 2)
  editor.props.onClose()
  root.render()
  assert.equal(find(root.tree, named('Editor')), undefined)
  sidebar.unmount()
  root.unmount()
})

test('overlay has no floating launcher in Legacy, TG or without a document', () => {
  for (const mode of ['legacy', 'tg', null]) {
    const document = mode === null ? undefined : { documentElement: { getAttribute: () => mode } }
    const { registrations, mount, listeners, window } = load({ document })
    const root = mount(registrations.find(entry => entry.options.name === 'shell.overlay').component)
    assert.equal(find(root.tree, named('Fab')), undefined, `no Fab for ${mode}`)
    assert.equal(find(root.tree, node => node.type === 'button'), undefined, 'overlay has no launcher button')
    assert.ok(find(root.tree, node => node.type === 'style'), 'editor styling remains mounted')
    assert.equal(listeners.get('dsh:tg-workspace-mode')?.size ?? 0, 0, 'editor no longer follows TG mode')
    window.dispatchEvent(new Event('dsh:soul-memory-open'))
    root.render()
    assert.ok(find(root.tree, named('Editor')), 'same editor remains event-openable')
    assert.equal(find(root.tree, named('Fab')), undefined)
    root.unmount()
    assert.equal(listeners.get('dsh:soul-memory-open')?.size, 0)
  }
})

test('overlay remains renderable without optional window event methods', () => {
  const client = load()
  client.window.addEventListener = undefined
  client.window.removeEventListener = undefined
  const root = client.mount(client.registrations.find(entry => entry.options.name === 'shell.overlay').component)
  assert.equal(find(root.tree, named('Fab')), undefined)
  assert.equal(find(root.tree, named('Editor')), undefined)
  root.unmount()
})

