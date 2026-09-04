const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1'])
const MAX_BODY_BYTES = 64 * 1024

function hostnameOf(value) {
  if (typeof value !== 'string' || value.trim() === '') return undefined
  try {
    return new URL(value.includes('://') ? value : `http://${value}`).hostname.toLowerCase()
  } catch {
    return undefined
  }
}

/** Accept only requests addressed to the local web profile and its own origin. */
export function isLoopbackRequest(req) {
  const host = hostnameOf(req?.headers?.host)
  if (host === undefined || !LOOPBACK_HOSTS.has(host)) return false
  const origin = req?.headers?.origin
  if (origin === undefined) return true
  return hostnameOf(origin) === host
}

/** Read one bounded JSON request body and reject non-JSON or oversized input. */
export async function parseJsonRequest(req) {
  const contentType = String(req?.headers?.['content-type'] ?? '').toLowerCase()
  if (!contentType.startsWith('application/json')) throw new Error('expected application/json')
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += bytes.byteLength
    if (size > MAX_BODY_BYTES) throw new Error('request body is too large')
    chunks.push(bytes)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new Error('invalid JSON body')
  }
}
