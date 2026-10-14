// api/ai.js
// Vercel Serverless Function — server-side proxy to Google's Gemini API.
// Keeps GEMINI_API_KEY off the client entirely.
//
// Setup: Vercel → Project → Settings → Environment Variables
//   GEMINI_API_KEY   (required)
//   GEMINI_MODEL     (optional, defaults to "gemini-2.5-flash")
//
// Migrated from netlify/functions/ai.js. The response shape is unchanged
// ({ content: [{ type: 'text', text }] }) so public/soko.html needs no
// other changes beyond the request URL.

const DEFAULT_MODEL = 'gemini-2.5-flash';
const MAX_MESSAGE_CHARS = 2000;

const SYSTEM_PROMPT =
  "You are SOKO's assistant, helping Rwanda-based buyers and sellers on the SOKO marketplace. " +
  'Answer questions about orders, delivery, escrow payments, MTN MoMo / Airtel Money, and selling on SOKO. ' +
  'Keep replies short, friendly, and practical. Support English, French, and Kinyarwanda depending on how the user writes.';

module.exports = async function handler(req, res) {
  // No CORS headers are sent, so this endpoint only answers same-origin calls.
  // That stops other websites from using your Gemini key as a free proxy.
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is not set in Vercel environment variables' });
  }

  // Vercel parses JSON bodies for us, but tolerate a raw string too.
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body || '{}');
    } catch (e) {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
  }

  const message = body && body.message;
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Missing "message" string in request body' });
  }
  if (message.length > MAX_MESSAGE_CHARS) {
    return res.status(413).json({ error: `Message too long (max ${MAX_MESSAGE_CHARS} characters)` });
  }

  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: message }] }],
          generationConfig: { maxOutputTokens: 500 },
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'Gemini API error' });
    }

    const text =
      data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') ||
      'Sorry, I could not get a response.';

    return res.status(200).json({ content: [{ type: 'text', text }] });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to reach Gemini API: ' + err.message });
  }
};
