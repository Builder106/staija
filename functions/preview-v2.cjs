const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const outDir = path.join(__dirname, 'email-previews')
fs.mkdirSync(outDir, { recursive: true })

const LOCAL_ASSETS = {
  'https://staija.org/staija-64.png': path.join(__dirname, '..', 'public', 'staija-64.png'),
  'https://staija.org/avatars/portrait-1.png': path.join(__dirname, '..', 'public', 'avatars', 'portrait-1.png'),
  'https://staija.org/avatars/portrait-3.png': path.join(__dirname, '..', 'public', 'avatars', 'portrait-3.png'),
  'https://staija.org/email/uli-divider-v1.png': path.join(__dirname, '..', 'public', 'email', 'uli-divider-v1.png'),
  'https://staija.org/email/masthead-violet-v1.png': path.join(__dirname, '..', 'public', 'email', 'masthead-violet-v1.png'),
  'https://staija.org/email/masthead-sky-v1.png': path.join(__dirname, '..', 'public', 'email', 'masthead-sky-v1.png'),
  'https://staija.org/email/masthead-gold-v1.png': path.join(__dirname, '..', 'public', 'email', 'masthead-gold-v1.png'),
}

function injectLocalAssets(html) {
  for (const [url, filePath] of Object.entries(LOCAL_ASSETS)) {
    if (fs.existsSync(filePath)) {
      const ext = path.extname(filePath).toLowerCase()
      const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png'
      const b64 = fs.readFileSync(filePath).toString('base64')
      html = html.replaceAll(`src="${url}"`, `src="data:${mime};base64,${b64}"`)
    }
  }
  return html
}

const VIOLET = '#8B55FF'
const SKY = '#5EDBE7'
const SKY_DEEP = '#0E7490'
const GOLD = '#F0B429'
const INK = '#0E1217'
const PAPER = '#F8FAFC'
const OUTER_BG = '#F1F5F9'
const BORDER = '#E2E8F0'
const MUTED = '#64748B'

const FONT_DISPLAY = "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
const FONT_SANS = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
const FONT_MONO = "'STAIJA Tac Mono', 'IBM Plex Mono', 'Courier New', Courier, monospace"
const FONT_EYEBROW = "'Ojuju', 'STAIJA Tac Mono', 'IBM Plex Mono', 'Courier New', Courier, monospace"
const APP_URL = 'https://staija.org'

function statusBadge(text, variant = 'slate') {
  const styles = {
    gold: { bg: '#FEF3C7', fg: '#92400E', border: '#FDE68A' },
    sky: { bg: '#E0F2FE', fg: '#075985', border: '#BAE6FD' },
    violet: { bg: '#F3E8FF', fg: '#6B21A8', border: '#E9D5FF' },
    emerald: { bg: '#D1FAE5', fg: '#065F46', border: '#A7F3D0' },
    slate: { bg: '#F1F5F9', fg: '#334155', border: '#CBD5E1' },
  }
  const s = styles[variant] || styles.slate
  return `<span style="background-color:${s.bg};color:${s.fg};border:1px solid ${s.border};border-radius:9999px;display:inline-block;font-family:${FONT_MONO};font-size:11px;font-weight:700;letter-spacing:0.06em;padding:3px 10px;text-transform:uppercase;">${text}</span>`
}

function scholarSpotlightCard(imgUrl, name, role, quote) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="background-color:${PAPER};border:1px solid ${BORDER};border-radius:14px;margin:24px 0;width:100%;">
        <tr>
          <td style="padding:22px 24px;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td width="60" style="vertical-align:top;padding-right:16px;">
                  <img src="${imgUrl}" alt="${name}" width="60" height="60" style="display:block;width:60px;height:60px;border-radius:50%;border:2px solid ${VIOLET};object-fit:cover;" />
                </td>
                <td style="vertical-align:top;">
                  <p style="margin:0 0 2px;font-family:${FONT_DISPLAY};font-size:15px;font-weight:700;color:${INK};">${name}</p>
                  <p style="margin:0 0 8px;font-family:${FONT_EYEBROW};font-size:11px;color:${MUTED};font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">${role}</p>
                  <p style="margin:0;font-family:${FONT_SANS};font-size:13px;color:#334155;line-height:1.5;font-style:italic;">&ldquo;${quote}&rdquo;</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>`
}

function teamSignature() {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:28px;">
        <tr>
          <td width="40" style="vertical-align:middle;padding-right:12px;">
            <img src="https://staija.org/staija-64.png" width="40" height="40" alt="STAIJA Emblem" style="display:block;width:40px;height:40px;border-radius:8px;border:1px solid ${BORDER};" />
          </td>
          <td style="vertical-align:middle;">
            <p style="margin:0;font-family:${FONT_DISPLAY};font-size:14px;font-weight:700;color:${INK};line-height:1.3;">The STAIJA Team</p>
            <p style="margin:0;font-family:${FONT_EYEBROW};font-size:11px;color:${MUTED};font-weight:600;letter-spacing:0.05em;text-transform:uppercase;">Research & Learning Operations</p>
          </td>
        </tr>
      </table>`
}

function button(label, url, opts = {}) {
  const bg = opts.bg || VIOLET
  const fg = opts.fg || '#ffffff'
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 16px;">
        <tr>
          <td>
            <a href="${url}" style="background-color:${bg};border-radius:10px;box-shadow:0 4px 14px rgba(139,85,255,0.25);color:${fg};display:inline-block;font-family:${FONT_DISPLAY};font-size:14px;font-weight:600;line-height:1;padding:15px 28px;text-decoration:none;letter-spacing:-0.1px;">${label} &nbsp;&rarr;</a>
          </td>
        </tr>
      </table>`
}

function refBox(applicationId, opts = {}) {
  const accent = opts.accent || VIOLET
  const badgeHtml = opts.status ? statusBadge(opts.status, opts.badgeVariant || 'slate') : ''
  const field = (key, value) => `<tr>
          <td style="padding:11px 14px 10px 0;border-bottom:1px dotted #CBD5E1;width:120px;vertical-align:middle;">
            <span style="font-family:${FONT_MONO};font-size:11px;font-weight:700;color:${MUTED};letter-spacing:0.1em;text-transform:uppercase;">${key}</span>
          </td>
          <td style="padding:11px 0 10px;border-bottom:1px dotted #CBD5E1;vertical-align:middle;">
            <span style="font-family:${FONT_MONO};font-size:13px;color:${INK};font-weight:600;">${value}</span>
          </td>
        </tr>`
  const rows = [
    ...(opts.program ? [field('PROGRAM', opts.program)] : []),
    field('REF NO', applicationId),
    ...(opts.status ? [field('STATUS', badgeHtml)] : []),
  ].join('')

  return `<table role="presentation" cellpadding="0" cellspacing="0" style="background-color:${PAPER};border:1px solid ${BORDER};border-top:3px solid ${accent};border-radius:12px;margin:24px 0 32px;width:100%;">
        <tr>
          <td style="padding:16px 22px 18px;">
            <p style="margin:0 0 12px;font-family:${FONT_MONO};font-size:10px;font-weight:700;color:${MUTED};letter-spacing:0.12em;text-transform:uppercase;">APPLICATION SUMMARY</p>
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%">${rows}</table>
          </td>
        </tr>
      </table>`
}

function calloutBox(title, body, opts = {}) {
  const bg = opts.bg || PAPER
  const border = opts.border || BORDER
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="background-color:${bg};border:1px solid ${border};border-radius:12px;margin:24px 0;width:100%;">
        <tr>
          <td style="padding:20px 24px;">
            <h4 style="margin:0 0 8px;font-family:${FONT_DISPLAY};font-size:15px;font-weight:700;color:${INK};line-height:1.3;">${title}</h4>
            <p style="margin:0;font-family:${FONT_SANS};font-size:14px;color:#334155;line-height:1.6;">${body}</p>
          </td>
        </tr>
      </table>`
}

function eyebrow(text) {
  return `<p style="margin:0 0 14px;font-family:${FONT_EYEBROW};font-size:12px;font-weight:600;color:${MUTED};letter-spacing:0.12em;text-transform:uppercase;">${text}</p>`
}

function heading(text) {
  return `<h1 style="margin:0 0 24px;font-family:${FONT_DISPLAY};font-size:28px;font-weight:700;color:${INK};line-height:1.2;letter-spacing:-0.5px;">${text}</h1>`
}

function p(text, styles = '') {
  return `<p style="margin:0 0 16px;font-family:${FONT_SANS};font-size:15px;color:#1E293B;line-height:1.75;${styles}">${text}</p>`
}

function divider() {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:30px 0 28px;width:100%;">
        <tr>
          <td style="font-size:0;line-height:0;"><div style="border-top:1px solid #E2E8F0;margin-top:10px;font-size:0;line-height:0;">&nbsp;</div></td>
          <td width="144" align="center" style="padding:0 12px;font-size:0;line-height:0;">
            <img src="https://staija.org/email/uli-divider-v1.png" width="120" height="20" alt="" style="display:block;border:0;" />
          </td>
          <td style="font-size:0;line-height:0;"><div style="border-top:1px solid #E2E8F0;margin-top:10px;font-size:0;line-height:0;">&nbsp;</div></td>
        </tr>
      </table>`
}

function layout(body, opts = {}) {
  const masthead = opts.masthead || 'violet'
  const headerAccent = masthead === 'gold' ? GOLD : masthead === 'sky' ? SKY : VIOLET

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:ital,wght@0,500;0,600;0,700;1,400&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&family=Inter:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Ojuju:wght@500;600;700&display=swap" rel="stylesheet" />
  <title>STAIJA Clean Human Email Preview</title>
</head>
<body style="margin:0;padding:0;background-color:${OUTER_BG};" bgcolor="${OUTER_BG}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${OUTER_BG}" style="background-color:${OUTER_BG};min-width:320px;padding:40px 16px 56px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border:1px solid ${BORDER};border-radius:16px;box-shadow:0 20px 40px -15px rgba(14,18,23,0.08);overflow:hidden;">
          <tr>
            <td bgcolor="${INK}" style="background-color:${INK};font-size:0;line-height:0;">
              <img src="https://staija.org/email/masthead-${masthead}-v1.png" width="600" height="120" alt="STAIJA" style="display:block;border:0;width:100%;height:auto;color:#ffffff;font-family:${FONT_DISPLAY};font-size:20px;font-weight:700;line-height:120px;text-align:left;" />
            </td>
          </tr>
          <tr>
            <td style="height:3px;background-color:${headerAccent};font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:40px 44px 48px;">
              ${body}
            </td>
          </tr>
        </table>

        <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          <tr>
            <td style="padding:24px 40px 0;" align="center">
              <p style="margin:0 0 6px;font-family:${FONT_SANS};font-size:12px;color:${MUTED};line-height:1.6;">
                Africa's next <em style="font-style:italic;color:${SKY_DEEP};">scientist-leaders</em> start here.
              </p>
              <p style="margin:0;font-family:${FONT_SANS};font-size:12px;color:${MUTED};line-height:1.6;">
                STAIJA &nbsp;|&nbsp;
                <a href="${APP_URL}" style="color:${MUTED};text-decoration:underline;">staija.org</a>
                &nbsp;|&nbsp;
                <a href="mailto:contact@staija.org" style="color:${MUTED};text-decoration:underline;">contact@staija.org</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

const templates = [
  {
    file: 'v5-1-application-accepted.html',
    label: 'V5 Human Accepted Email (Clean & Specific)',
    content: layout(`
      ${eyebrow('Dynamerge')}
      ${heading("Welcome to the Dynamerge cohort.")}
      ${p('Hi Amara,')}
      ${p("We're delighted to let you know that the admissions committee has accepted your application to <strong>Dynamerge</strong>.")}
      ${p('Your background in computational biology and your research proposal stood out during our review process.')}
      ${calloutBox('Onboarding & Orientation', 'Dr. Amina Yusuf will lead cohort onboarding. We will email your scholar agreement and cohort schedule within 48 hours so you can prepare before week one.', { bg: '#FEF3C7', border: '#FDE68A' })}
      ${refBox('#STJ-2026-8942', { program: 'Dynamerge', status: 'ACCEPTED ✓', badgeVariant: 'gold', accent: GOLD })}
      ${teamSignature()}
    `, { masthead: 'gold' }),
  },
  {
    file: 'v5-2-welcome-newsletter.html',
    label: 'V5 Human Welcome Newsletter (Authentic Scholar Story)',
    content: layout(`
      ${eyebrow('Stay Connected')}
      ${heading("Thanks for signing up.")}
      ${p("You'll hear from us when the next StepUp Scholars application cycle opens — in-person, 6-month research incubator based in Nigeria.")}
      ${scholarSpotlightCard(
        'https://staija.org/avatars/portrait-1.png',
        'Dr. Amina Yusuf',
        'Postdoctoral Fellow & STAIJA Research Mentor',
        'Guiding young African researchers through original experimental design has been one of the most rewarding parts of my academic career.'
      )}
      ${p('If your plans change or you would like to update your list preferences, you can adjust your settings anytime.', 'margin-bottom:0;')}
      ${button('Browse Open Programs', 'https://staija.org/stay-connected')}
      ${divider()}
      ${teamSignature()}
    `, { masthead: 'violet' }),
  },
  {
    file: 'v5-3-mentor-intro.html',
    label: 'V5 Human Mentor Intro (Authentic Copy)',
    content: layout(`
      ${eyebrow('STAIJA Mentorship')}
      ${heading("Guide early-stage student research.")}
      ${p('Mentors at STAIJA are working scientists, computational engineers, and academic researchers who dedicate 2–3 hours a month to guide undergraduate researchers.')}
      ${p('Mentorship focuses on reviewing experimental design, giving feedback on paper drafts, and helping students work through technical blockers.')}
      ${scholarSpotlightCard(
        'https://staija.org/avatars/portrait-3.png',
        'Sarah Nwachukwu',
        'PhD Researcher & Former STAIJA Scholar',
        'STAIJA mentors gave me my first real research break. Being able to pay that forward to students across West Africa is deeply meaningful.'
      )}
      ${button('Accept Mentor Invite', 'https://staija.org/stay-connected', { bg: SKY, fg: INK })}
      ${divider()}
      ${teamSignature()}
    `, { masthead: 'sky' }),
  },
]

for (const tpl of templates) {
  const filePath = path.join(outDir, tpl.file)
  fs.writeFileSync(filePath, injectLocalAssets(tpl.content), 'utf8')
  console.log(`  ✓ ${tpl.label} → functions/email-previews/${tpl.file}`)
  try {
    execSync(`open "${filePath}"`)
  } catch {}
}

console.log(`\nAll V5 Clean Human Email Previews rendered to: ${outDir}`)
