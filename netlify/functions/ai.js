// netlify/functions/ai.js
// Server-side proxy to Google's Gemini API — keeps GEMINI_API_KEY off the client entirely.
// Set GEMINI_API_KEY in Netlify: Site settings → Environment variables.
// Optional: set GEMINI_MODEL to override the default (e.g. "gemini-2.5-flash").

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'GEMINI_API_KEY is not set in Netlify environment variables' }),
    };
  }

  let message;
  try {
    const body = JSON.parse(event.body || '{}');
    message = body.message;
    if (!message || typeof message !== 'string') {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing "message" string in request body' }) };
    }
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const systemPrompt =
    "You are SOKO's assistant, helping Rwanda-based buyers and sellers on the SOKO marketplace. " +
    'Answer questions about orders, delivery, escrow payments, MTN MoMo / Airtel Money, and selling on SOKO. ' +
    'Keep replies short, friendly, and practical. Support English, French, and Kinyarwanda depending on how the user writes.';

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
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: message }] }],
          generationConfig: { maxOutputTokens: 500 },
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ error: data.error?.message || 'Gemini API error' }),
      };
    }

    // Normalize Gemini's response shape into the same shape the frontend already
    // expects from Anthropic — { content: [{ text }] } — so soko.html needs no changes.
    const text =
      data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') ||
      'Sorry, I could not get a response.';

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ content: [{ type: 'text', text }] }),
    };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to reach Gemini API: ' + err.message }) };
  }
};