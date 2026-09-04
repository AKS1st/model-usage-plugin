import test from 'node:test'
import assert from 'node:assert/strict'
import { isLoopbackRequest, parseJsonRequest } from '../src/route-security.js'

test('accepts loopback same-origin requests', async () => {
  const req = { headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' } }
  assert.equal(isLoopbackRequest(req), true)
})

test('rejects non-loopback and cross-origin requests', () => {
  assert.equal(isLoopbackRequest({ headers: { host: '0.0.0.0:3000' } }), false)
  assert.equal(isLoopbackRequest({ headers: { host: '127.0.0.1:3000', origin: 'https://evil.example' } }), false)
})

test('parses only JSON request bodies', async () => {
  const req = { headers: { 'content-type': 'application/json; charset=utf-8' } }
  req[Symbol.asyncIterator] = async function* () { yield Buffer.from('{"action":"snapshot"}') }
  assert.deepEqual(await parseJsonRequest(req), { action: 'snapshot' })
})
