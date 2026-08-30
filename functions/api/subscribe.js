// functions/api/subscribe.js
//
// CLOUDFLARE PAGES FUNCTION — place this file at exactly: functions/api/subscribe.js
// (Cloudflare Pages auto-routes files in /functions by their path — this file
//  will be reachable at: https://yoursite.com/api/subscribe, matching what
//  the scorecard already calls — no HTML changes needed)
//
// Fires on every Market Perception Scorecard™ submission (right after
// someone finishes all 25 questions + the expertise self-rating, and enters
// their name, email, and WhatsApp — before they see results).
//
// Does three things, in parallel:
//  1. Emails the LEAD their own full personalised report, instantly.
//  2. Emails BRENDA a notification with the lead's contact info and report.
//  3. Writes a record to Airtable, the CRM.
//
// ── PROJECT STRUCTURE ─────────────────────────────────────────────
//   your-project/
//     index.html                 ← the scorecard file
//     functions/
//       api/
//         subscribe.js           ← this file
//
// ── AIRTABLE SCHEMA ("Scorecard Leads" table) ────────────────────
//      Name                  — Single line text
//      Email                 — Single line text
//      WhatsApp              — Single line text
//      Band                  — Single line text
//      Percent Score         — Number
//      Bottleneck Stage      — Single line text
//      Strongest Stage       — Single line text
//      Expertise Score       — Number
//      Perception Gap        — Number
//      Market Perception     — Number
//      Market Association    — Number
//      Market Trust          — Number
//      Market Recognition    — Number
//      Market Choice         — Number
//      Report                — Long text
//      Status                — Single select: New Lead, Messaged, Converted, Not Interested
//      Submitted At           — Date (include time)
//
// ── CLOUDFLARE PAGES ENV VARS ────────────────────────────────────
// (Cloudflare dashboard → your Pages project → Settings → Environment variables)
//      RESEND_API_KEY
//      NOTIFY_EMAIL          — your inbox, e.g. brenda@brendablanche.site
//      FROM_EMAIL            — verified sender, e.g. reports@brendablanche.site
//      AIRTABLE_API_KEY
//      AIRTABLE_BASE_ID
//      AIRTABLE_TABLE_NAME   — "Scorecard Leads"
//
// The scorecard POSTs here with: { name, email, whatsapp, band, bandName,
// percentScore, bottleneckStage, strongestStage, expertiseScore,
// perceptionGap, stageScores, reportText } where stageScores is:
// { "Market Perception": 80, "Market Association": 80, "Market Trust": 80,
//   "Market Recognition": 40, "Market Choice": 80 }  — each already 0-100.

export async function onRequestPost(context) {
  const { request, env } = context;

  let data;
  try {
    data = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const {
    name = 'Unknown',
    email = '',
    whatsapp = 'Not provided',
    bandName = 'Unknown',
    percentScore = 0,
    bottleneckStage = 'Unknown',
    strongestStage = 'Unknown',
    expertiseScore = 0,
    perceptionGap = 0,
    stageScores = {},
    reportText = ''
  } = data;

  const cleanNumber = whatsapp.replace(/[^\d+]/g, '');
  const waLink = cleanNumber ? `https://wa.me/${cleanNumber.replace('+', '')}` : null;

  const reportHtml = reportText
    .split('\n')
    .map((line) => line || '&nbsp;')
    .join('<br>');

  // ── Email 1: to the LEAD — their own report ──────────────────────
  const leadEmailHtml = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0F0C0D">
      <p style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#C49A3C;margin-bottom:4px">
        Market Perception Scorecard™
      </p>
      <h2 style="margin:0 0 16px">Hi ${name}, here's your full diagnosis</h2>
      <p style="font-size:14px;line-height:1.6;color:#333">
        Thanks for taking the Market Perception Scorecard™. Your complete results are below —
        save this email, or reach out on WhatsApp any time if you want to talk through what to do next.
      </p>
      <div style="background:#F5EFE6;padding:16px;font-size:13px;line-height:1.6;white-space:pre-wrap;margin-top:16px">${reportHtml}</div>
      <p style="margin-top:24px">
        <a href="https://calendly.com/unapologeticquenn/brand-clarity-call" style="background:#E4007C;color:#fff;padding:12px 20px;text-decoration:none;border-radius:2px;display:inline-block;font-size:13px">Book a Free Clarity Call →</a>
      </p>
      <p style="font-size:11px;color:#999;margin-top:24px">Market Perception Scorecard™ · Brenda Blanche™ · #UnapologeticallyYou</p>
    </div>
  `;

  const leadEmailPromise = email
    ? fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: env.FROM_EMAIL,
          to: email,
          subject: `Your Market Perception Diagnosis — ${bandName} (${percentScore}%)`,
          html: leadEmailHtml
        })
      }).then(async (r) => {
        if (!r.ok) console.error('Resend error (lead email):', await r.text());
      }).catch((err) => console.error('Lead email send failed:', err))
    : Promise.resolve();

  // ── Email 2: to BRENDA — notification with lead's info + report ─
  const stageRows = Object.entries(stageScores)
    .map(([stage, pct]) => {
      let tag = '';
      if (stage === bottleneckStage) tag = ' ← bottleneck';
      if (stage === strongestStage) tag = ' ← what\u2019s working';
      return `<tr><td style="color:#6E6570">${stage}</td><td>${pct}%${tag}</td></tr>`;
    })
    .join('');

  const notifyEmailHtml = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0F0C0D">
      <p style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#C49A3C;margin-bottom:4px">
        New Scorecard Completion
      </p>
      <h2 style="margin:0 0 16px">${name} just finished the Market Perception Scorecard™</h2>
      <table cellpadding="6" style="border-collapse:collapse;font-size:14px;width:100%;margin-bottom:16px">
        <tr><td style="color:#6E6570">Email</td><td><strong>${email}</strong></td></tr>
        <tr><td style="color:#6E6570">WhatsApp</td><td><strong>${whatsapp}</strong></td></tr>
        <tr><td style="color:#6E6570">Level</td><td><strong>${bandName} (${percentScore}%)</strong></td></tr>
        <tr><td style="color:#6E6570">Bottleneck</td><td>${bottleneckStage}</td></tr>
        <tr><td style="color:#6E6570">What's Working</td><td>${strongestStage}</td></tr>
        <tr><td style="color:#6E6570">Self-Rated Expertise</td><td>${expertiseScore}%</td></tr>
        <tr><td style="color:#6E6570">Perception Gap</td><td>${perceptionGap} points</td></tr>
        ${stageRows}
      </table>
      ${waLink ? `<p><a href="${waLink}" style="background:#E4007C;color:#fff;padding:12px 20px;text-decoration:none;border-radius:2px;display:inline-block;font-size:13px">Message ${name} on WhatsApp →</a></p>` : ''}
      <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
      <p style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#C49A3C;margin-bottom:8px">
        Full Report (already sent to them)
      </p>
      <div style="background:#F5EFE6;padding:16px;font-size:13px;line-height:1.6;white-space:pre-wrap">${reportHtml}</div>
    </div>
  `;

  const notifyEmailPromise = fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: env.FROM_EMAIL,
      to: env.NOTIFY_EMAIL,
      subject: `🔔 ${name} just completed the Scorecard — ${bandName} (${percentScore}%)`,
      html: notifyEmailHtml
    })
  }).then(async (r) => {
    if (!r.ok) console.error('Resend error (notify email):', await r.text());
  }).catch((err) => console.error('Notify email send failed:', err));

  // ── Airtable CRM record ───────────────────────────────────────────
  const tableName = encodeURIComponent(env.AIRTABLE_TABLE_NAME || 'Scorecard Leads');
  const airtablePromise = fetch(
    `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${tableName}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fields: {
          'Name': name,
          'Email': email,
          'WhatsApp': whatsapp,
          'Band': bandName,
          'Percent Score': percentScore,
          'Bottleneck Stage': bottleneckStage,
          'Strongest Stage': strongestStage,
          'Expertise Score': expertiseScore,
          'Perception Gap': perceptionGap,
          'Market Perception': stageScores['Market Perception'] || 0,
          'Market Association': stageScores['Market Association'] || 0,
          'Market Trust': stageScores['Market Trust'] || 0,
          'Market Recognition': stageScores['Market Recognition'] || 0,
          'Market Choice': stageScores['Market Choice'] || 0,
          'Report': reportText,
          'Status': 'New Lead',
          'Submitted At': new Date().toISOString()
        }
      })
    }
  ).then(async (r) => {
    if (!r.ok) console.error('Airtable error:', await r.text());
  }).catch((err) => console.error('Airtable write failed:', err));

  await Promise.allSettled([leadEmailPromise, notifyEmailPromise, airtablePromise]);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
