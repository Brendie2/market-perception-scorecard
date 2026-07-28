// api/subscribe.js
//
// VERCEL SERVERLESS FUNCTION — place this file at exactly: api/subscribe.js
// (Vercel auto-detects anything in an /api folder as a live endpoint.
//  This one will be reachable at: https://yoursite.vercel.app/api/subscribe,
//  matching what the scorecard already calls — no HTML changes needed)
//
// Fires on every Market Perception Scorecard™ submission (right after someone
// finishes all 32 statements + the expertise self-rating, and enters their
// name + WhatsApp — before they see results).
//
// Does two things:
//  1. Sends Brenda an instant email with the lead's full personalised report,
//     so she can copy-paste it straight into WhatsApp when they message her.
//  2. Creates a record in an Airtable base functioning as a lightweight CRM,
//     so every scorecard lead is tracked with a status you can move through
//     a pipeline (New Lead → Messaged → Converted → Not Interested).
//
// ── SETUP (one-time) ──────────────────────────────────────────────
//
// PROJECT STRUCTURE:
//   your-project/
//     index.html          ← the scorecard file (rename from
//                           market-perception-scorecard.html to index.html)
//     api/
//       subscribe.js       ← this file
//
// EMAIL (Resend — free up to 3,000/month, no card needed):
// 1. Sign up at https://resend.com and verify a sending domain.
// 2. Grab your API key from the dashboard.
//
// CRM (Airtable — free tier is plenty for this):
// 1. Create a base, add a table named exactly: Scorecard Leads
// 2. Add these fields (names must match exactly):
//      Name                        — Single line text
//      WhatsApp                    — Single line text
//      Band                        — Single line text (e.g. "Preferred")
//      Percent Score               — Number
//      Gap Dimension               — Single line text (the weakest of the 8)
//      Expertise Score             — Number
//      Perception Gap              — Number
//      Identity Clarity            — Number
//      Market Translation          — Number
//      Positioning                 — Number
//      Category Strength           — Number
//      Narrative Architecture      — Number
//      Trust Architecture          — Number
//      Visibility System           — Number
//      Memory Recommendation       — Number
//      Report                      — Long text
//      Status                      — Single select: New Lead, Messaged, Converted, Not Interested
//      Submitted At                 — Date (include time)
// 3. Base ID from https://airtable.com/api (starts with "app...")
// 4. Personal Access Token from https://airtable.com/create/tokens
//    with scopes: data.records:write, data.records:read, access to your base
//
// VERCEL ENV VARS (Project → Settings → Environment Variables):
//      RESEND_API_KEY
//      NOTIFY_EMAIL          — your inbox, e.g. brenda@theunapologetics.com
//      FROM_EMAIL            — a verified Resend sender, e.g. scorecard@theunapologetics.com
//      AIRTABLE_API_KEY      — your Personal Access Token
//      AIRTABLE_BASE_ID      — starts with "app..."
//      AIRTABLE_TABLE_NAME   — "Scorecard Leads" (or whatever you named it)
//
// No changes needed to the scorecard HTML — CONFIG.API_ENDPOINT already
// points at '/api/subscribe', which is exactly where this file lives.
//
// The scorecard POSTs here with: { name, whatsapp, band, bandName,
// percentScore, gapDimension, expertiseScore, perceptionGap,
// dimensionScores, reportText } where dimensionScores is an object like:
// { "Identity Clarity": 16, "Market Translation": 14, ... }

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const {
    name = 'Unknown',
    whatsapp = 'Not provided',
    band = 'Unknown',
    bandName = band,
    percentScore = 0,
    gapDimension = 'Unknown',
    expertiseScore = 0,
    perceptionGap = 0,
    dimensionScores = {},
    reportText = ''
  } = req.body || {};

  const cleanNumber = whatsapp.replace(/[^\d+]/g, '');
  const waLink = cleanNumber ? `https://wa.me/${cleanNumber.replace('+', '')}` : null;

  // ── 1. Email notification with full report ──────────────────────
  const reportHtml = reportText
    .split('\n')
    .map((line) => line || '&nbsp;')
    .join('<br>');

  const dimensionRows = Object.entries(dimensionScores)
    .map(([dim, score]) => `<tr><td style="color:#6E6570">${dim}</td><td>${score}/20${dim === gapDimension ? ' ← primary gap' : ''}</td></tr>`)
    .join('');

  const emailHtml = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0F0C0D">
      <p style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#C49A3C;margin-bottom:4px">
        New Scorecard Completion
      </p>
      <h2 style="margin:0 0 16px">${name} just finished the Market Perception Scorecard™</h2>
      <table cellpadding="6" style="border-collapse:collapse;font-size:14px;width:100%;margin-bottom:16px">
        <tr><td style="color:#6E6570">WhatsApp</td><td><strong>${whatsapp}</strong></td></tr>
        <tr><td style="color:#6E6570">Level</td><td><strong>${bandName} (${percentScore}%)</strong></td></tr>
        <tr><td style="color:#6E6570">Primary Gap</td><td>${gapDimension}</td></tr>
        <tr><td style="color:#6E6570">Self-Rated Expertise</td><td>${expertiseScore}%</td></tr>
        <tr><td style="color:#6E6570">Perception Gap</td><td>${perceptionGap} points</td></tr>
        ${dimensionRows}
      </table>
      ${waLink ? `<p><a href="${waLink}" style="background:#D90429;color:#fff;padding:12px 20px;text-decoration:none;border-radius:2px;display:inline-block;font-size:13px">Message ${name} on WhatsApp →</a></p>` : ''}
      <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
      <p style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#C49A3C;margin-bottom:8px">
        Full Report — copy/paste into WhatsApp
      </p>
      <div style="background:#F5EFE6;padding:16px;font-size:13px;line-height:1.6;white-space:pre-wrap">${reportHtml}</div>
    </div>
  `;

  const emailPromise = fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: process.env.FROM_EMAIL,
      to: process.env.NOTIFY_EMAIL,
      subject: `🔔 ${name} just completed the Scorecard — ${bandName} (${percentScore}%)`,
      html: emailHtml
    })
  }).then(async (r) => {
    if (!r.ok) console.error('Resend error:', await r.text());
  }).catch((err) => console.error('Email send failed:', err));

  // ── 2. Airtable CRM record ───────────────────────────────────────
  const tableName = encodeURIComponent(process.env.AIRTABLE_TABLE_NAME || 'Scorecard Leads');
  const airtablePromise = fetch(
    `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${tableName}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fields: {
          'Name': name,
          'WhatsApp': whatsapp,
          'Band': bandName,
          'Percent Score': percentScore,
          'Gap Dimension': gapDimension,
          'Expertise Score': expertiseScore,
          'Perception Gap': perceptionGap,
          'Identity Clarity': dimensionScores['Identity Clarity'] || 0,
          'Market Translation': dimensionScores['Market Translation'] || 0,
          'Positioning': dimensionScores['Positioning'] || 0,
          'Category Strength': dimensionScores['Category Strength'] || 0,
          'Narrative Architecture': dimensionScores['Narrative Architecture'] || 0,
          'Trust Architecture': dimensionScores['Trust Architecture'] || 0,
          'Visibility System': dimensionScores['Visibility System'] || 0,
          'Memory Recommendation': dimensionScores['Memory & Recommendation'] || 0,
          'Report': reportText,
          'Status': 'New Lead',
          'Submitted At': new Date().toISOString()
        }
      })
    }
  ).then(async (r) => {
    if (!r.ok) console.error('Airtable error:', await r.text());
  }).catch((err) => console.error('Airtable write failed:', err));

  await Promise.allSettled([emailPromise, airtablePromise]);

  return res.status(200).json({ ok: true });
}
