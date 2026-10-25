const allowedOrigins = new Set([
  'https://soko-omega.vercel.app',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const publishableKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

function json(req: Request, payload: unknown, status = 200) {
  const origin = req.headers.get('origin') ?? '';
  const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  if (allowedOrigins.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  }
  return new Response(JSON.stringify(payload), { status, headers });
}

async function postAuth(path: string, body: unknown) {
  return fetch(`${supabaseUrl}/auth/v1/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: publishableKey },
    body: JSON.stringify(body),
  });
}

async function lookupEmail(phone: string): Promise<string | null> {
  const query = new URLSearchParams({ select: 'email', phone: `eq.${phone}`, limit: '2' });
  const response = await fetch(`${supabaseUrl}/rest/v1/users?${query}`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!response.ok) throw new Error('profile_lookup_failed');
  const rows = await response.json();
  return rows.length === 1 && typeof rows[0]?.email === 'string' ? rows[0].email : null;
}

async function claimAttempt(req: Request): Promise<boolean> {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim();
  const ip = req.headers.get('x-real-ip')?.trim() || forwarded;
  if (!ip || ip.length > 100) return false;
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/claim_phone_auth_attempt`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ p_client_ip: ip }),
  });
  if (!response.ok) throw new Error('rate_limit_unavailable');
  return response.json();
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin') ?? '';
  if (origin && !allowedOrigins.has(origin)) return json(req, { error: 'Not allowed' }, 403);
  if (req.method === 'OPTIONS') {
    const headers = new Headers({
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Max-Age': '86400',
    });
    if (allowedOrigins.has(origin)) headers.set('Access-Control-Allow-Origin', origin);
    return new Response('ok', { headers });
  }
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405);
  if (!supabaseUrl || !publishableKey || !serviceKey) {
    return json(req, { error: 'Phone authentication is temporarily unavailable' }, 503);
  }

  try {
    const body = await req.json();
    const action = body?.action;
    const phone = typeof body?.phone === 'string'
      ? body.phone.replace(/[\s().-]/g, '')
      : '';
    const password = body?.password;
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) return json(req, { error: 'Invalid sign-in details' }, 400);
    if (action !== 'login' && action !== 'recover') return json(req, { error: 'Invalid request' }, 400);
    if (action === 'login' && (typeof password !== 'string' || password.length < 1 || password.length > 128)) {
      return json(req, { error: 'Invalid sign-in details' }, 400);
    }
    if (!await claimAttempt(req)) return json(req, { error: 'Too many attempts. Try again later.' }, 429);

    const email = await lookupEmail(phone);
    if (action === 'recover') {
      const redirectTo = 'https://soko-omega.vercel.app/reset-password';
      const recoveryEmail = email ?? `unknown-${crypto.randomUUID()}@invalid.example`;
      const response = await postAuth(`recover?redirect_to=${encodeURIComponent(redirectTo)}`, { email: recoveryEmail });
      if (!response.ok && response.status !== 429) throw new Error('recovery_request_failed');
      return json(req, { ok: true });
    }

    // Use the Auth password-grant endpoint server-side so the phone-to-email
    // mapping never becomes a public lookup API. Invalid numbers receive the
    // same response as an incorrect password.
    const loginEmail = email ?? `unknown-${crypto.randomUUID()}@invalid.example`;
    const response = await postAuth('token?grant_type=password', { email: loginEmail, password });
    if (!response.ok) {
      if (response.status === 429) return json(req, { error: 'Too many attempts. Try again later.' }, 429);
      return json(req, { error: 'Sign-in failed. Check your details and try again.' }, 401);
    }
    const session = await response.json();
    return json(req, { session });
  } catch {
    return json(req, { error: 'Phone authentication is temporarily unavailable' }, 503);
  }
});
