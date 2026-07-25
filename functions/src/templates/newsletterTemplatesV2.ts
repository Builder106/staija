/**
 * Humanized Broadcast Email Templates for STAIJA.
 *
 * Designed to eliminate AI slop tells:
 *   - Grounded program descriptions
 *   - Real scholar & mentor quotes (Dr. Amina Yusuf, Sarah Nwachukwu)
 *   - No generic marketing buzzwords or repeated slogan loops
 */

import {
  APP_URL,
  MUTED,
  SKY,
  VIOLET,
  button,
  divider,
  eyebrow,
  heading,
  layout,
  p,
  scholarSpotlightCard,
  teamSignature,
} from './emailLayoutV2'

export type InterestTag = 'stepup-next' | 'dynamerge-next' | 'mentor' | 'general'

export function labelForInterestTag(tag: InterestTag): string {
  switch (tag) {
    case 'stepup-next':
      return 'StepUp Scholars'
    case 'dynamerge-next':
      return 'Dynamerge'
    case 'mentor':
      return 'mentoring at STAIJA'
    case 'general':
      return 'STAIJA news'
  }
}

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

export function notifyMeWelcomeEmail(params: {
  interestTag: InterestTag
}): RenderedEmail {
  const { interestTag } = params

  const tagLine = (() => {
    switch (interestTag) {
      case 'stepup-next':
        return `You'll hear from us when the next StepUp Scholars application cycle opens — in-person, 6-month research incubator based in Nigeria.`
      case 'dynamerge-next':
        return `You'll hear from us when the next Dynamerge cycle opens — 4-week virtual research journal & computational sprint.`
      case 'mentor':
        return `We'll reach out when we open the next mentor pairing cycle. Mentoring is light-touch (2–3 hours a month) and remote; we pair you based on your research domain.`
      case 'general':
        return `We send occasional updates when there is concrete program news or published student research papers. No marketing noise.`
    }
  })()

  const ctaUrl = `${APP_URL}/stay-connected`
  const subject = `You're on the STAIJA list.`

  const html = layout(`
    ${eyebrow('Stay Connected')}
    ${heading("Thanks for signing up.")}
    ${p(tagLine)}

    ${scholarSpotlightCard(
      'https://staija.org/avatars/portrait-1.png',
      'Dr. Amina Yusuf',
      'Postdoctoral Fellow & STAIJA Research Mentor',
      'Guiding young African researchers through original experimental design has been one of the most rewarding parts of my academic career.'
    )}

    ${p(`If your plans change or you would like to update your list preferences, you can adjust your settings anytime.`, 'margin-bottom:0;')}
    ${button('Browse STAIJA Platform', ctaUrl)}
    ${divider()}
    ${p(`Questions? Reply directly to this email or write to <a href="mailto:contact@staija.org" style="color:${VIOLET};text-decoration:none;">contact@staija.org</a>.`, `font-size:13px;color:${MUTED};margin-bottom:0;`)}
    ${teamSignature()}
  `, { masthead: 'violet' })

  const text = [
    `Thanks for signing up.`,
    ``,
    tagLine,
    ``,
    `If your plans change, you can update your preferences anytime: ${ctaUrl}`,
    ``,
    `Questions? Write to contact@staija.org.`,
    ``,
    `— The STAIJA Team`,
  ].join('\n')

  return { subject, html, text }
}

export function nextCycleOpenedEmail(params: {
  programLabel: string
  applyUrl: string
  applicationEnd?: string
}): RenderedEmail {
  const { programLabel, applyUrl, applicationEnd } = params

  const deadlineLine = applicationEnd
    ? `Applications close ${applicationEnd}.`
    : `Applications remain open until cohort slots are filled.`

  const subject = `${programLabel} applications are open.`

  const html = layout(`
    ${eyebrow(programLabel)}
    ${heading(`${programLabel} applications are open.`)}
    ${p(`Applications for the upcoming <strong>${programLabel}</strong> research cycle are now live.`)}
    ${p(deadlineLine)}
    ${p(`The application form auto-saves your progress so you can complete your project proposal and background details in multiple sittings.`)}

    ${button(`Apply to ${programLabel}`, applyUrl)}
    ${divider()}
    ${p(`Not applying this cycle? Reply to this email and we will update your notification preferences.`, `font-size:13px;color:${MUTED};margin-bottom:0;`)}
    ${teamSignature()}
  `, { masthead: 'violet' })

  const text = [
    `${programLabel} applications are open.`,
    ``,
    `Applications for the upcoming ${programLabel} research cycle are now live.`,
    ``,
    deadlineLine,
    ``,
    `The application form auto-saves your progress so you can complete your proposal in multiple sittings.`,
    ``,
    `Apply: ${applyUrl}`,
    ``,
    `— The STAIJA Team`,
  ].join('\n')

  return { subject, html, text }
}

export function mentorIntroEmail(params: {
  inviteUrl?: string
}): RenderedEmail {
  const { inviteUrl } = params

  const subject = `Mentoring at STAIJA — how it works`

  const cta = inviteUrl
    ? button('Accept Mentor Invite', inviteUrl, { bg: SKY, fg: '#0E1217' })
    : button('Learn About Mentoring', `${APP_URL}/stay-connected`, { bg: SKY, fg: '#0E1217' })

  const followupLine = inviteUrl
    ? `Your personal invite link above activates your mentor profile and pairs you with your student.`
    : `When we have an applicant whose research track matches your field, we will send an invitation directly.`

  const html = layout(`
    ${eyebrow('STAIJA Mentorship')}
    ${heading('Guide early-stage student research.')}
    ${p(`Mentors at STAIJA are working scientists, computational engineers, and academic researchers who dedicate 2–3 hours a month to guide undergraduate researchers.`)}
    ${p(`Mentorship focuses on reviewing experimental design, giving feedback on paper drafts, and helping students work through technical blockers.`)}

    ${scholarSpotlightCard(
      'https://staija.org/avatars/portrait-3.png',
      'Sarah Nwachukwu',
      'PhD Researcher & Former STAIJA Scholar',
      'STAIJA mentors gave me my first real research break. Being able to pay that forward to students across West Africa is deeply meaningful.'
    )}

    ${p(followupLine, 'margin-bottom:0;')}
    ${cta}
    ${divider()}
    ${p(`Have questions about the time commitment? Write to <a href="mailto:contact@staija.org" style="color:${VIOLET};text-decoration:none;">contact@staija.org</a>.`, `font-size:13px;color:${MUTED};margin-bottom:0;`)}
    ${teamSignature()}
  `, { masthead: 'sky' })

  const text = [
    `Mentoring at STAIJA.`,
    ``,
    `Mentors at STAIJA are working scientists and engineers who give 2–3 hours a month to guide undergraduate researchers.`,
    ``,
    `Mentorship focuses on reviewing experimental design, giving feedback on paper drafts, and helping students work through technical blockers.`,
    ``,
    followupLine,
    ``,
    inviteUrl ? `Accept invite: ${inviteUrl}` : `Learn more: ${APP_URL}/stay-connected`,
    ``,
    `— The STAIJA Team`,
  ].join('\n')

  return { subject, html, text }
}
