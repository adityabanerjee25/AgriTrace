import { handleCors } from '../_utils/http.js';

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const LANGUAGES = new Set(['English', 'Hindi', 'Bengali', 'Marathi', 'Telugu', 'Tamil', 'Gujarati', 'Kannada', 'Malayalam', 'Punjabi', 'Odia']);

const cleanAnswer = (value = '') => String(value)
  .replace(/\\?<think>[\s\S]*?<\\?\/think>/gi, '')
  .replace(/\\?<think>[\s\S]*$/gi, '')
  .replace(/\\?<\\?\/think>/gi, '')
  .replace(/^#{1,6}\s+/gm, '')
  .trim();

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(503).json({ success: false, message: 'Chat service is not configured.' });
  const { messages = [], language = 'English', context = {} } = req.body || {};
  if (!Array.isArray(messages) || !messages.length) return res.status(400).json({ success: false, message: 'A message is required.' });
  const selectedLanguage = LANGUAGES.has(language) ? language : 'English';
  const safeMessages = messages.filter(item => item && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string').slice(-12);
  if (!safeMessages.length || safeMessages.at(-1).role !== 'user') return res.status(400).json({ success: false, message: 'A user message is required.' });
  try {
    const response = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      signal: AbortSignal.timeout(30000),
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json',  },
      body: JSON.stringify({ model: 'qwen/qwen3.8-27b', messages: [{ role: 'system', content: `You are AgriTrace's practical market assistant. Reply only in ${selectedLanguage}. Return only the final answer—never expose reasoning, analysis, XML tags or a thinking process. Write 2–4 short, polished paragraphs or bullets with the most useful action first. Help with mandi prices, selling windows, quality, buyers, logistics, storage, payments and grievances. Never invent live prices, buyer credentials or transaction status. When crop, district or current data is missing, state exactly what is needed and direct the user to the relevant AgriTrace page. Use these verified AgriTrace navigation facts: farmers create lots in Sell lots & FPO using Create sell lot, then select crop, variety, quantity, location, asking price and optional crop photos. Buyers publish requirements in Buyer demand and place offers against produce lots. Market intelligence contains dated market evidence and optional model advice. Logistics & storage contains storage discovery. Telegram linking and alert preferences are in the account menu under Notification settings. Payments currently use a test UPI flow, not verified live settlement. Do not invent Sourcing or Inventory dashboards, a Help Center, account managers, permission names, required harvest dates or supplier IDs. If a workflow is not covered by these facts, ask what screen the user sees instead of guessing. User context: ${JSON.stringify(context)}` }, ...safeMessages], temperature: 0.7, max_tokens: 350, reasoning_format: 'hidden', reasoning_effort: 'none' })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return res.status(502).json({ success: false, message: payload?.error?.message || 'Chat provider unavailable.' });
    const answer = cleanAnswer(payload?.choices?.[0]?.message?.content);
    if (!answer) return res.status(502).json({ success: false, message: 'Chat provider returned an empty answer.' });
    return res.status(200).json({ success: true, answer, model: payload.model || 'qwen/qwen3.8-27b', language: selectedLanguage });
  } catch (error) { return res.status(502).json({ success: false, message: error.message || 'Chat provider unavailable.' }); }
}
