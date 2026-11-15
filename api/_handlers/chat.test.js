import test from 'node:test';
import assert from 'node:assert/strict';
import handler from './chat.js';

test('market assistant sends formerly canned questions to Groq Qwen 3.8', async () => {
  const oldFetch = global.fetch, oldKey = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = 'fixture-only';
  let calls = 0;
  global.fetch = async (url, options) => {
    assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions');
    assert.equal(JSON.parse(options.body).model, 'qwen/qwen3.8-27b');
    calls++;
    return { ok: true, json: async () => ({ choices: [{ message: { content: '<think>hidden</think>Fixture answer' } }] }) };
  };
  try {
    for (const question of ['mandi prices', 'How do I create a produce lot?']) {
      let status, packet;
      await handler({ method: 'POST', headers: {}, body: { messages: [{ role: 'user', content: question }] } }, { setHeader() {}, status(value) { status = value; return this; }, json(value) { packet = value; } });
      assert.equal(status, 200); assert.equal(packet.model, 'qwen/qwen3.8-27b'); assert.equal(packet.answer, 'Fixture answer');
    }
    assert.equal(calls, 2);
  } finally {
    global.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = oldKey;
  }
});
