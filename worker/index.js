/**
 * GreenBrahma site Worker.
 *
 * Static files are served by the assets binding. This Worker only handles
 * form posts at /api/contact: it stores every submission in D1 and, when a
 * notification address is configured, emails it to Geoff.
 *
 * Settings (Cloudflare dashboard > Workers > greenbrahma > Settings > Variables):
 *   NOTIFY_TO    address that receives form notifications (required for email)
 *   NOTIFY_FROM  sender address on a domain onboarded for Cloudflare Email Sending
 */

const FORMS = {
  contact: { done: '/thank-you', label: 'Contact form' },
  engage: { done: '/thanks', label: 'BrahmaScore design partner form' },
  brett: { done: '/thanks', label: 'Reseller walkthrough form' },
};
const MAX_LEN = 5000;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/contact') {
      if (request.method !== 'POST') return json({ ok: false, error: 'Use POST.' }, 405, { Allow: 'POST' });
      return handleForm(request, env, ctx, url);
    }

    const res = await env.ASSETS.fetch(request);
    // Keep the workers.dev copy of the site out of search results.
    if (url.hostname.endsWith('.workers.dev')) {
      const copy = new Response(res.body, res);
      copy.headers.set('X-Robots-Tag', 'noindex, nofollow');
      return copy;
    }
    return res;
  },
};

async function handleForm(request, env, ctx, url) {
  const wantsJson = (request.headers.get('Accept') || '').includes('application/json');

  // Only accept posts that come from this site's own pages.
  const origin = request.headers.get('Origin');
  if (origin && new URL(origin).host !== url.host) return json({ ok: false, error: 'Cross-site post refused.' }, 403);

  let data;
  try {
    data = await request.formData();
  } catch (e) {
    return json({ ok: false, error: 'The form could not be read.' }, 400);
  }

  const fields = {};
  for (const [k, v] of data.entries()) {
    if (typeof v === 'string') fields[k] = v.trim().slice(0, MAX_LEN);
  }
  const formName = fields['form-name'] || 'contact';
  const form = FORMS[formName];
  if (!form) return json({ ok: false, error: 'Unknown form.' }, 400);

  const finish = () => (wantsJson ? json({ ok: true }) : Response.redirect(new URL(form.done, url).toString(), 303));

  // Honeypot: real visitors never fill this in. Pretend success so bots move on.
  if (fields['bot-field']) return finish();

  const email = fields.email || '';
  if (!fields.name || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return json({ ok: false, error: 'A name and a valid email address are required.' }, 422);
  }

  const record = {
    form: formName,
    name: fields.name,
    email,
    company: fields.company || '',
    phone: fields.phone || '',
    reply_by: fields['reply-by'] || '',
    message: fields.message || fields.where || fields.notes || '',
  };
  delete fields['bot-field'];

  let id = null;
  try {
    const r = await env.DB.prepare(
      `INSERT INTO submissions (form, name, email, company, phone, reply_by, message, fields, host, country)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(record.form, record.name, record.email, record.company, record.phone, record.reply_by, record.message,
      JSON.stringify(fields), url.host, request.cf?.country || '').run();
    id = r.meta?.last_row_id ?? null;
  } catch (e) {
    console.error('submission not stored', e);
    return json({ ok: false, error: 'The note could not be saved. Try again in a moment.' }, 500);
  }

  // Notify after responding, so a slow mail hop never delays the visitor.
  ctx.waitUntil(notify(env, form, record, fields, id));
  return finish();
}

async function notify(env, form, record, fields, id) {
  if (!env.EMAIL || !env.NOTIFY_TO || !env.NOTIFY_FROM) return;
  const lines = [
    `${form.label} on greenbrahma.com`,
    '',
    `Name:     ${record.name}`,
    `Email:    ${record.email}`,
    record.company && `Company:  ${record.company}`,
    record.reply_by && `Reply by: ${record.reply_by}`,
    record.phone && `Phone:    ${record.phone}`,
    '',
    record.message,
  ].filter((l) => l !== false && l !== undefined && l !== null);
  const extra = Object.entries(fields).filter(([k]) =>
    !['form-name', 'subject', 'name', 'email', 'company', 'phone', 'reply-by', 'message', 'where', 'notes'].includes(k));
  if (extra.length) lines.push('', ...extra.map(([k, v]) => `${k}: ${v}`));

  try {
    await env.EMAIL.send({
      from: { email: env.NOTIFY_FROM, name: 'GreenBrahma website' },
      to: env.NOTIFY_TO,
      replyTo: record.email,
      subject: `New inquiry from ${record.name}${record.company ? ' (' + record.company + ')' : ''}`,
      text: lines.join('\n'),
    });
    if (id) await env.DB.prepare('UPDATE submissions SET notified = 1 WHERE id = ?').bind(id).run();
  } catch (e) {
    console.error('notification failed', e);
    if (id) await env.DB.prepare('UPDATE submissions SET notify_error = ? WHERE id = ?').bind(String(e?.message || e).slice(0, 500), id).run();
  }
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } });
}
