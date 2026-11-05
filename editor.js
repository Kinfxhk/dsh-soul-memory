/**
 * Host HTTP editor API for the sidebar/footer and native Settings editor.
 *
 * The Client module (`client.js`) is deliberately dumb: it reads and writes
 * through these endpoints, so all caps, backups, and atomic writes stay in the
 * Host half. The API only exposes the three note targets; it never accepts a
 * filesystem path from the browser.
 *
 * @module @local/dsh-soul-memory/editor
 */
import { statSync } from 'node:fs'

/** Mount prefix; the client fetches `/soul-memory/api/...`. */
export const ROOT = '/soul-memory'

/** Reject oversized request bodies before parsing JSON. */
const MAX_BODY = 1_000_000

const TARGETS = ['soul', 'user', 'memory']
const LABELS = { soul: 'SOUL.md', user: 'USER.md', memory: 'MEMORY.md' }

/**
 * Read a JSON request body.
 * @param {import('node:http').IncomingMessage} req - request.
 * @returns {Promise<Record<string, unknown>>} parsed body.
 */
async function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => {
      raw += chunk
      if (raw.length > MAX_BODY) {
        reject(new Error('request body too large'))
        req.destroy()
      }
    })
    req.on('end', () => {
      if (raw.trim() === '') return resolve({})
      try {
        resolve(JSON.parse(raw))
      } catch {
        reject(new Error('invalid JSON body'))
      }
    })
    req.on('error', reject)
  })
}

/**
 * Send one JSON response.
 * @param {import('node:http').ServerResponse} res - response.
 * @param {number} status - HTTP status.
 * @param {unknown} value - JSON value.
 */
function sendJson(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(body)
}

/**
 * Build the editor handler for one plugin instance.
 * @param {{ notes: import('./store.js').Notes, book: import('./skills.js').SkillBook }} services - plugin services.
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void>} handler.
 */
export function createEditorHandler(services) {
  const { notes, book } = services

  function state() {
    const summary = notes.summary()
    const files = summary.rows.map((row) => {
      let updatedAt = null
      try {
        updatedAt = statSync(row.path).mtimeMs
      } catch {
        // A missing file has no timestamp.
      }
      return {
        target: row.target,
        label: row.label,
        path: row.path,
        chars: row.chars,
        exists: row.exists,
        budget: row.target === 'soul' ? notes.maxSoulChars : notes.maxMemoryChars,
        updatedAt,
      }
    })
    const user = files.find((file) => file.target === 'user')
    const memory = files.find((file) => file.target === 'memory')
    return {
      ok: true,
      home: summary.home,
      files,
      memory: {
        userChars: user?.chars ?? 0,
        memoryChars: memory?.chars ?? 0,
        budget: notes.maxMemoryChars,
      },
      skills: book.list().length,
      maxFileChars: notes.maxFileChars,
    }
  }

  return async function handler(req, res) {
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`)
      const route = url.pathname.startsWith(ROOT) ? url.pathname.slice(ROOT.length) : url.pathname

      if (req.method === 'GET' && (route === '' || route === '/' || route === '/api/state')) {
        sendJson(res, 200, state())
        return
      }

      if (req.method === 'GET' && route === '/api/file') {
        const target = url.searchParams.get('target') ?? ''
        if (!TARGETS.includes(target)) {
          sendJson(res, 400, { ok: false, error: `unknown target ${JSON.stringify(target)}; use soul, user, or memory` })
          return
        }
        const file = notes.read(target)
        const budget = target === 'soul' ? notes.maxSoulChars : notes.maxMemoryChars
        sendJson(res, 200, { ...file, budget })
        return
      }

      if (req.method === 'POST' && route === '/api/file') {
        if (!String(req.headers['content-type'] ?? '').includes('application/json')) {
          sendJson(res, 415, { ok: false, error: 'content-type must be application/json' })
          return
        }
        const body = await readBody(req)
        const target = typeof body.target === 'string' ? body.target : ''
        if (!TARGETS.includes(target)) {
          sendJson(res, 400, { ok: false, error: `unknown target ${JSON.stringify(target)}; use soul, user, or memory` })
          return
        }
        if (typeof body.content !== 'string') {
          sendJson(res, 400, { ok: false, error: 'content must be a string' })
          return
        }
        const result = await notes.set(target, body.content)
        sendJson(res, 200, { ok: true, result, state: state() })
        return
      }

      if (req.method === 'GET' && route === '/api/skills') {
        sendJson(res, 200, {
          ok: true,
          skills: book.list(),
          summary: book.listSummary(),
          state: state(),
        })
        return
      }

      sendJson(res, 404, { ok: false, error: `not found: ${req.method} ${url.pathname}` })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const validation = /unknown target|must be|cap is|would be|too large|invalid JSON/.test(message)
      sendJson(res, validation ? 400 : 500, { ok: false, error: message })
    }
  }
}
