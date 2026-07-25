/**
 * Authentic, Humanized HTML Email Layout Primitives for STAIJA.
 *
 * Designed to eliminate AI slop tells:
 *   - No redundant hero preview cards or repeated slogan loops
 *   - No generic emoji grid boxes ("World-Class Labs")
 *   - Grounded typography (IBM Plex Sans, Inter, Ojuju, IBM Plex Mono)
 *   - Realistic reference IDs (#STJ-2026-8942)
 */

export const APP_URL = process.env.APP_URL ?? 'https://staija.org'

// --- Brand Tokens & Fonts ---------------------------------------------------
export const VIOLET = '#8B55FF'
export const VIOLET_DEEP = '#6B3FE0'
export const SKY = '#5EDBE7'
export const SKY_DEEP = '#0E7490'
export const GOLD = '#F0B429'
export const GOLD_DEEP = '#A16207'
export const INK = '#0E1217'
export const PAPER = '#F8FAFC'      // slate-50 elevated surface
export const OUTER_BG = '#F1F5F9'   // slate-100 outer canvas
export const BORDER = '#E2E8F0'     // slate-200 hairlines
export const MUTED = '#64748B'      // slate-500 muted text

export const FONT_DISPLAY = "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
export const FONT_SANS = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
export const FONT_MONO = "'STAIJA Tac Mono', 'IBM Plex Mono', 'Courier New', Courier, monospace"
export const FONT_EYEBROW = "'Ojuju', 'STAIJA Tac Mono', 'IBM Plex Mono', 'Courier New', Courier, monospace"

export type MastheadVariant = 'violet' | 'sky' | 'gold'
export type BadgeVariant = 'gold' | 'sky' | 'violet' | 'emerald' | 'slate'

// --- Status Badge Helper ----------------------------------------------------

export function statusBadge(text: string, variant: BadgeVariant = 'slate'): string {
  const styles: Record<BadgeVariant, { bg: string; fg: string; border: string }> = {
    gold: { bg: '#FEF3C7', fg: '#92400E', border: '#FDE68A' },
    sky: { bg: '#E0F2FE', fg: '#075985', border: '#BAE6FD' },
    violet: { bg: '#F3E8FF', fg: '#6B21A8', border: '#E9D5FF' },
    emerald: { bg: '#D1FAE5', fg: '#065F46', border: '#A7F3D0' },
    slate: { bg: '#F1F5F9', fg: '#334155', border: '#CBD5E1' },
  }
  const s = styles[variant] || styles.slate

  return `<span style="background-color:${s.bg};color:${s.fg};border:1px solid ${s.border};border-radius:9999px;display:inline-block;font-family:${FONT_MONO};font-size:11px;font-weight:700;letter-spacing:0.06em;padding:3px 10px;text-transform:uppercase;">${text}</span>`
}

// --- Authentic Content Components -------------------------------------------

/** Scholar & Mentor Spotlight Card */
export function scholarSpotlightCard(imgUrl: string, name: string, role: string, quote: string): string {
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

/** Team Signature Media Component */
export function teamSignature(): string {
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

// --- Standard Primitives ----------------------------------------------------

export function button(
  label: string,
  url: string,
  opts: { bg?: string; fg?: string } = {}
): string {
  const bg = opts.bg ?? VIOLET
  const fg = opts.fg ?? '#ffffff'
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 16px;">
        <tr>
          <td>
            <!--[if mso]>
            <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
              href="${url}" style="height:46px;v-text-anchor:middle;width:230px;"
              arcsize="22%" strokecolor="${bg}" fillcolor="${bg}">
              <w:anchorlock/>
              <center style="color:${fg};font-family:sans-serif;font-size:14px;font-weight:600;">${label} &rarr;</center>
            </v:roundrect>
            <![endif]-->
            <!--[if !mso]><!-->
            <a href="${url}" style="background-color:${bg};border-radius:10px;box-shadow:0 4px 14px rgba(139,85,255,0.25);color:${fg};display:inline-block;font-family:${FONT_DISPLAY};font-size:14px;font-weight:600;line-height:1;padding:15px 28px;text-decoration:none;letter-spacing:-0.1px;">${label} &nbsp;&rarr;</a>
            <!--<![endif]-->
          </td>
        </tr>
      </table>`
}

export function refBox(
  applicationId: string,
  opts: { program?: string; status?: string; badgeVariant?: BadgeVariant; accent?: string } = {}
): string {
  const accent = opts.accent ?? VIOLET
  const badgeHtml = opts.status
    ? statusBadge(opts.status, opts.badgeVariant || 'slate')
    : ''

  const field = (key: string, value: string) => `<tr>
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

export function calloutBox(title: string, body: string, opts: { bg?: string; border?: string } = {}): string {
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

export function eyebrow(text: string): string {
  return `<p style="margin:0 0 14px;font-family:${FONT_EYEBROW};font-size:12px;font-weight:600;color:${MUTED};letter-spacing:0.12em;text-transform:uppercase;">${text}</p>`
}

export function heading(text: string): string {
  return `<h1 style="margin:0 0 24px;font-family:${FONT_DISPLAY};font-size:28px;font-weight:700;color:${INK};line-height:1.2;letter-spacing:-0.5px;">${text}</h1>`
}

export function p(text: string, styles = ''): string {
  return `<p style="margin:0 0 16px;font-family:${FONT_SANS};font-size:15px;color:#1E293B;line-height:1.75;${styles}">${text}</p>`
}

export function divider(): string {
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

export function layout(body: string, opts: { masthead?: MastheadVariant } = {}): string {
  const masthead = opts.masthead ?? 'violet'
  const headerAccent = masthead === 'gold' ? GOLD : masthead === 'sky' ? SKY : VIOLET

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:ital,wght@0,500;0,600;0,700;1,400&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&family=Inter:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Ojuju:wght@500;600;700&display=swap" rel="stylesheet" />
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:${OUTER_BG};" bgcolor="${OUTER_BG}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${OUTER_BG}" style="background-color:${OUTER_BG};min-width:320px;padding:40px 16px 56px;">
    <tr>
      <td align="center">
        <!-- Main Card Wrapper -->
        <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border:1px solid ${BORDER};border-radius:16px;box-shadow:0 20px 40px -15px rgba(14,18,23,0.08);overflow:hidden;">

          <!-- Masthead Header -->
          <tr>
            <td bgcolor="${INK}" style="background-color:${INK};font-size:0;line-height:0;">
              <img src="https://staija.org/email/masthead-${masthead}-v1.png" width="600" height="120" alt="STAIJA" style="display:block;border:0;width:100%;height:auto;color:#ffffff;font-family:${FONT_DISPLAY};font-size:20px;font-weight:700;line-height:120px;text-align:left;" />
            </td>
          </tr>

          <!-- Gradient Hairline Accent Strip -->
          <tr>
            <td style="height:3px;background-color:${headerAccent};font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <!-- Main Content Area -->
          <tr>
            <td style="padding:40px 44px 48px;">
              ${body}
            </td>
          </tr>

        </table>

        <!-- Outer Footer Wrapper -->
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
