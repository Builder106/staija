/**
 * Humanized 1:1 Transactional Email Templates for STAIJA.
 *
 * Designed to eliminate AI slop tells:
 *   - Specific, grounded program details & clear next steps
 *   - Authentic, conversational human copy
 *   - Realistic reference IDs (#STJ-2026-8942)
 *   - No redundant image cards or emoji grid boxes
 */

import {
  APP_URL,
  FONT_DISPLAY,
  FONT_MONO,
  GOLD,
  INK,
  MUTED,
  PAPER,
  SKY,
  SKY_DEEP,
  VIOLET,
  button,
  calloutBox,
  divider,
  eyebrow,
  heading,
  layout,
  p,
  refBox,
  teamSignature,
} from './emailLayoutV2'

export function applicationReceivedEmail(params: {
  firstName: string
  programLabel: string
  applicationId: string
}): { html: string; text: string } {
  const { firstName, programLabel, applicationId } = params

  const html = layout(`
    ${eyebrow(programLabel)}
    ${heading('We received your application.')}
    ${p(`Hi ${firstName},`)}
    ${p(`Thanks for applying to <strong>${programLabel}</strong>. We've saved your materials and assigned your application to our review committee.`)}

    ${calloutBox(
      'What to expect next',
      'Our team evaluates applications in small batches. You can expect to hear back from us by email within five business days regarding next steps or any follow-up questions.'
    )}

    ${refBox(applicationId, {
      program: programLabel,
      status: 'RECEIVED',
      badgeVariant: 'sky',
    })}

    ${teamSignature()}
  `, { masthead: 'violet' })

  const text = [
    `Hi ${firstName},`,
    ``,
    `Thanks for applying to ${programLabel}. We've received your materials and passed them to our review committee.`,
    ``,
    `Our team evaluates applications in small batches. Expect to hear from us within five business days regarding next steps or any follow-up questions.`,
    ``,
    `Your application reference ID: ${applicationId}`,
    ``,
    `— The STAIJA Team`,
  ].join('\n')

  return { html, text }
}

export function applicationAcceptedEmail(params: {
  firstName: string
  programLabel: string
  applicationId: string
}): { html: string; text: string } {
  const { firstName, programLabel, applicationId } = params

  const html = layout(`
    ${eyebrow(programLabel)}
    ${heading(`Welcome to the ${programLabel} cohort.`)}
    ${p(`Hi ${firstName},`)}
    ${p(`We're delighted to let you know that the admissions committee has accepted your application to <strong>${programLabel}</strong>.`)}
    ${p(`Your background and research goals stood out during our review process, and we are excited to work together during the upcoming cycle.`)}

    ${calloutBox(
      'Onboarding & Orientation',
      'Dr. Amina Yusuf will lead cohort onboarding. We will email your scholar agreement and cohort schedule within 48 hours so you can prepare before week one.',
      { bg: '#FEF3C7', border: '#FDE68A' }
    )}

    ${refBox(applicationId, {
      program: programLabel,
      status: 'ACCEPTED ✓',
      badgeVariant: 'gold',
      accent: GOLD,
    })}

    ${teamSignature()}
  `, { masthead: 'gold' })

  const text = [
    `Hi ${firstName},`,
    ``,
    `We're delighted to let you know that the admissions committee has accepted your application to ${programLabel}.`,
    ``,
    `Your background and research goals stood out during our review process. Dr. Amina Yusuf will lead cohort onboarding, and we'll email your scholar agreement and schedule within 48 hours.`,
    ``,
    `Application reference ID: ${applicationId}`,
    ``,
    `Welcome aboard.`,
    `— The STAIJA Team`,
  ].join('\n')

  return { html, text }
}

export function applicationRejectedEmail(params: {
  firstName: string
  programLabel: string
  applicationId: string
}): { html: string; text: string } {
  const { firstName, programLabel, applicationId } = params
  const dashboardUrl = `${APP_URL}/applicant/applications`

  const html = layout(`
    ${eyebrow(programLabel)}
    ${heading('An update on your application.')}
    ${p(`Hi ${firstName},`)}
    ${p(`There is an update available regarding your <strong>${programLabel}</strong> application. Please sign in to your STAIJA dashboard to read the note from the review committee.`)}

    ${button('View Update on Dashboard', dashboardUrl)}

    ${refBox(applicationId, {
      program: programLabel,
      status: 'DECISION POSTED',
      badgeVariant: 'slate',
    })}

    ${p('Thank you for the care and effort you put into your application.', 'margin-bottom:0;')}
    ${teamSignature()}
  `, { masthead: 'violet' })

  const text = [
    `Hi ${firstName},`,
    ``,
    `There's an update on your ${programLabel} application.`,
    ``,
    `Sign in to your account to read the note from our review committee:`,
    dashboardUrl,
    ``,
    `Reference ID: ${applicationId}`,
    ``,
    `Thank you for your time and effort.`,
    `— The STAIJA Team`,
  ].join('\n')

  return { html, text }
}

export function spotReOfferedEmail(params: {
  firstName: string
  programLabel: string
  applicationId: string
}): { html: string; text: string } {
  const { firstName, programLabel, applicationId } = params
  const dashboardUrl = `${APP_URL}/applicant/applications/${applicationId}`

  const html = layout(`
    ${eyebrow(programLabel)}
    ${heading('Your spot is open for the next cohort.')}
    ${p(`Hi ${firstName},`)}
    ${p(`When you deferred your acceptance to <strong>${programLabel}</strong> last cycle, we reserved a spot for you in the upcoming cohort.`)}

    ${calloutBox(
      'Action Required',
      'Please sign in to confirm, decline, or extend your deferral so we can finalize cohort pairing for the upcoming research term.'
    )}

    ${button('Respond to Offer', dashboardUrl)}

    ${refBox(applicationId, {
      program: programLabel,
      status: 'OFFER OPEN',
      badgeVariant: 'violet',
    })}

    ${teamSignature()}
  `, { masthead: 'violet' })

  const text = [
    `Hi ${firstName},`,
    ``,
    `When you deferred your acceptance to ${programLabel} last cycle, we reserved a spot for you in the upcoming cohort.`,
    ``,
    `Sign in to confirm or adjust your deferral status before cohort pairing begins: ${dashboardUrl}`,
    ``,
    `Reference ID: ${applicationId}`,
    ``,
    `— The STAIJA Team`,
  ].join('\n')

  return { html, text }
}

export function referenceInviteEmail(params: {
  refName: string
  applicantName: string
  programLabel: string
  relationship: string
  institution: string
  uploadUrl: string
}): { html: string; text: string } {
  const { refName, applicantName, programLabel, relationship, institution, uploadUrl } = params
  const relationshipPhrase = relationship ? `their ${relationship}` : 'a reference'
  const institutionPhrase = institution ? ` at ${institution}` : ''

  const html = layout(`
    ${eyebrow(`${programLabel} | Recommendation Request`)}
    ${heading(`Recommendation request for ${applicantName}`)}
    ${p(`Hi ${refName},`)}
    ${p(`<strong>${applicantName}</strong> has applied to <strong>${programLabel}</strong> at STAIJA and listed you as ${relationshipPhrase}${institutionPhrase}.`)}

    ${calloutBox(
      'About the Recommendation',
      "We value specific insights into the applicant's research problem-solving, analytical focus, and technical work ethic. A concise letter (1–2 paragraphs) is ideal.",
      { bg: '#E0F2FE', border: '#BAE6FD' }
    )}

    ${button('Upload Recommendation', uploadUrl, { bg: SKY, fg: INK })}

    ${divider()}
    ${p(`If you have any questions, write to us directly at <a href="mailto:contact@staija.org" style="color:${SKY_DEEP};text-decoration:underline;">contact@staija.org</a>.`, `font-size:13px;color:${MUTED};margin-bottom:0;`)}
    ${teamSignature()}
  `, { masthead: 'sky' })

  const text = [
    `Hi ${refName},`,
    ``,
    `${applicantName} has applied to ${programLabel} at STAIJA and listed you as ${relationshipPhrase}${institutionPhrase}.`,
    ``,
    `You can upload your recommendation letter using your private upload link:`,
    uploadUrl,
    ``,
    `A short, specific note focusing on analytical problem-solving and work ethic carries strong weight with our review panel.`,
    ``,
    `Questions? Write to us at contact@staija.org.`,
    ``,
    `— The STAIJA Team`,
  ].join('\n')

  return { html, text }
}

export function referenceLetterReceivedEmail(params: {
  firstName: string
  refName: string
  programLabel: string
  applicationId: string
}): { html: string; text: string } {
  const { firstName, refName, programLabel, applicationId } = params
  const statusUrl = `${APP_URL}/applicant/applications/${applicationId}`

  const html = layout(`
    ${eyebrow(programLabel)}
    ${heading('Recommendation letter received.')}
    ${p(`Hi ${firstName},`)}
    ${p(`<strong>${refName}</strong> has submitted their recommendation letter for your <strong>${programLabel}</strong> application.`)}

    ${button('View Application Status', statusUrl)}

    ${refBox(applicationId, {
      program: programLabel,
      status: 'LETTER RECEIVED ✓',
      badgeVariant: 'emerald',
    })}

    ${teamSignature()}
  `, { masthead: 'violet' })

  const text = [
    `Hi ${firstName},`,
    ``,
    `${refName} uploaded their recommendation letter for your ${programLabel} application.`,
    ``,
    `View status: ${statusUrl}`,
    `Reference ID: ${applicationId}`,
    ``,
    `— The STAIJA Team`,
  ].join('\n')

  return { html, text }
}

export function welcomeEmail(params: {
  firstName: string
}): { html: string; text: string } {
  const { firstName } = params
  const programsUrl = `${APP_URL}/programs`

  const html = layout(`
    ${eyebrow('Welcome to STAIJA')}
    ${heading('Glad you connected with STAIJA.')}
    ${p(`Hi ${firstName},`)}
    ${p(`STAIJA builds research incubators and technical learning programs grounded in local African university challenges and global STEM standards.`)}
    ${p(`Whether you are an undergraduate exploring your first lab project or a mentor looking to support young researchers, we run our programs in clear, structured cycles.`)}

    ${button('Explore Open Programs', programsUrl)}

    ${divider()}
    ${p(`Questions about eligibility or upcoming tracks? Reach out anytime at <a href="mailto:contact@staija.org" style="color:${VIOLET};text-decoration:underline;">contact@staija.org</a>.`, `font-size:13px;color:${MUTED};margin-bottom:0;`)}
    ${teamSignature()}
  `, { masthead: 'violet' })

  const text = [
    `Hi ${firstName},`,
    ``,
    `Glad you connected with STAIJA. We build research incubators and technical learning programs grounded in local African university challenges and global STEM standards.`,
    ``,
    `Take a look at our open programs when you have a moment: ${programsUrl}`,
    ``,
    `Questions? Write to contact@staija.org.`,
    ``,
    `— The STAIJA Team`,
  ].join('\n')

  return { html, text }
}

export function enrollmentEmail(params: {
  firstName: string
  programLabel: string
  courseUrl: string
}): { html: string; text: string } {
  const { firstName, programLabel, courseUrl } = params

  const html = layout(`
    ${eyebrow(programLabel)}
    ${heading('Your course workspace is ready.')}
    ${p(`Hi ${firstName},`)}
    ${p(`You are enrolled in <strong>${programLabel}</strong>. Your workspace and mentor profile link are now active.`)}

    ${calloutBox(
      'Course Structure',
      'Lessons are asynchronous so you can fit study around your lab schedule. Live mentor check-ins and milestone reviews are published on your cohort calendar.'
    )}

    ${button('Open Course Workspace', courseUrl)}

    ${divider()}
    ${teamSignature()}
  `, { masthead: 'violet' })

  const text = [
    `Hi ${firstName},`,
    ``,
    `You are enrolled in ${programLabel}. Your workspace and mentor profile link are active.`,
    ``,
    `Open your course: ${courseUrl}`,
    ``,
    `— The STAIJA Team`,
  ].join('\n')

  return { html, text }
}

export function submissionGradedEmail(params: {
  firstName: string
  assignmentSlug: string
  grade?: number
  mentorComment: string
  submissionUrl: string
}): { html: string; text: string } {
  const { firstName, grade, mentorComment, submissionUrl } = params

  const html = layout(`
    ${eyebrow('Milestone Feedback')}
    ${heading('Mentor feedback on your submission.')}
    ${p(`Hi ${firstName},`)}
    ${typeof grade === 'number' ? p(`Score: <strong>${grade} / 100</strong>`) : ''}

    ${mentorComment ? calloutBox('Mentor Feedback', mentorComment) : ''}

    ${button('View Full Review', submissionUrl)}

    ${divider()}
    ${teamSignature()}
  `, { masthead: 'violet' })

  const text = [
    `Hi ${firstName},`,
    ``,
    typeof grade === 'number' ? `Score: ${grade}/100.` : '',
    mentorComment ? `Mentor feedback: ${mentorComment}` : '',
    ``,
    `View full submission: ${submissionUrl}`,
    ``,
    `— The STAIJA Team`,
  ]
    .filter((l) => l !== '')
    .join('\n')

  return { html, text }
}

export function sessionInviteEmail(params: {
  firstName: string
  sessionTitle: string
  startsAt: string
  meetingUrl: string
}): { html: string; text: string } {
  const { firstName, sessionTitle, startsAt, meetingUrl } = params

  const html = layout(`
    ${eyebrow('Live Cohort Session')}
    ${heading(sessionTitle)}
    ${p(`Hi ${firstName},`)}
    ${p(`A live session for your cohort is scheduled for <strong>${startsAt}</strong>.`)}

    ${calloutBox(
      'Session Details',
      `Scheduled Start: ${startsAt}<br />Access: Dedicated meeting room.`
    )}

    ${button('Join Session', meetingUrl)}

    ${divider()}
    ${teamSignature()}
  `, { masthead: 'violet' })

  const text = [
    `Hi ${firstName},`,
    ``,
    `Live session scheduled: ${sessionTitle}`,
    `Time: ${startsAt}`,
    `Link: ${meetingUrl}`,
    ``,
    `— The STAIJA Team`,
  ].join('\n')

  return { html, text }
}

export function accountDeletedEmail(params: {
  firstName: string
}): { html: string; text: string } {
  const { firstName } = params

  const html = layout(`
    ${eyebrow('Account Confirmation')}
    ${heading('Your STAIJA account has been deleted.')}
    ${p(`Hi ${firstName},`)}
    ${p(`Per your request, we have removed your STAIJA account, profile records, and associated application history.`)}

    ${divider()}
    ${p(`If you did not initiate account deletion, please notify security immediately at <a href="mailto:contact@staija.org" style="color:${VIOLET};text-decoration:none;">contact@staija.org</a>.`, 'margin-bottom:0;')}
    ${teamSignature()}
  `, { masthead: 'violet' })

  const text = [
    `Hi ${firstName},`,
    ``,
    `Per your request, we have deleted your STAIJA account and associated profile records.`,
    ``,
    `If you didn't request this, contact security at contact@staija.org immediately.`,
    ``,
    `— The STAIJA Team`,
  ].join('\n')

  return { html, text }
}

export function newApplicationStaffNotificationEmail(params: {
  applicantName: string
  applicantEmail: string
  programLabel: string
  applicationId: string
}): { html: string; text: string } {
  const { applicantName, applicantEmail, programLabel, applicationId } = params
  const reviewUrl = `${APP_URL}/admin/applications/${applicationId}`

  const html = layout(`
    ${eyebrow(`${programLabel} | Staff Alert`)}
    ${heading(`New Application: ${applicantName}`)}
    ${p(`A new <strong>${programLabel}</strong> application has been submitted and is ready for review.`)}

    <table role="presentation" cellpadding="0" cellspacing="0" style="background-color:${PAPER};border:1px solid #CBD5E1;border-radius:12px;margin:24px 0 32px;width:100%;">
      <tr>
        <td style="padding:18px 22px;">
          <p style="margin:0;font-family:${FONT_MONO};font-size:10px;font-weight:700;color:${MUTED};letter-spacing:0.12em;text-transform:uppercase;">APPLICANT</p>
          <p style="margin:4px 0 14px;font-family:${FONT_DISPLAY};font-size:14px;color:${INK};font-weight:600;">${applicantName} &nbsp;|&nbsp; <a href="mailto:${applicantEmail}" style="color:${INK};text-decoration:none;font-weight:500;">${applicantEmail}</a></p>
          <p style="margin:0;font-family:${FONT_MONO};font-size:10px;font-weight:700;color:${MUTED};letter-spacing:0.12em;text-transform:uppercase;">APPLICATION REF ID</p>
          <p style="margin:4px 0 0;font-family:${FONT_MONO};font-size:13px;color:${INK};font-weight:600;">${applicationId}</p>
        </td>
      </tr>
    </table>

    ${button('Open Application in Admin', reviewUrl)}
    ${teamSignature()}
  `, { masthead: 'violet' })

  const text = [
    `New application: ${applicantName} — ${programLabel}`,
    ``,
    `Applicant: ${applicantName} <${applicantEmail}>`,
    `Ref ID: ${applicationId}`,
    ``,
    `Open in admin: ${reviewUrl}`,
    ``,
    `— The STAIJA Team`,
  ].join('\n')

  return { html, text }
}

export function referenceReminderEmail(params: {
  refName: string
  applicantName: string
  programLabel: string
  relationship: string
  institution: string
  uploadUrl: string
}): { html: string; text: string } {
  const { refName, applicantName, programLabel, relationship, institution, uploadUrl } = params
  const relationshipPhrase = relationship ? `their ${relationship}` : 'a reference'
  const institutionPhrase = institution ? ` at ${institution}` : ''

  const html = layout(`
    ${eyebrow(`${programLabel} | Reference Follow-up`)}
    ${heading(`Follow-up: Recommendation for ${applicantName}`)}
    ${p(`Hi ${refName},`)}
    ${p(`We are following up regarding <strong>${applicantName}</strong>'s application to ${programLabel}, where you were listed as ${relationshipPhrase}${institutionPhrase}.`)}

    ${calloutBox(
      'Recommendation Link',
      'If you are still planning to submit a recommendation, please use your personal upload link below.',
      { bg: '#E0F2FE', border: '#BAE6FD' }
    )}

    ${button('Upload Recommendation', uploadUrl, { bg: SKY, fg: INK })}

    ${divider()}
    ${p(`If you prefer not to submit a reference, no further action is needed. Reach us at <a href="mailto:contact@staija.org" style="color:${SKY_DEEP};text-decoration:underline;">contact@staija.org</a>.`, `font-size:13px;color:${MUTED};margin-bottom:0;`)}
    ${teamSignature()}
  `, { masthead: 'sky' })

  const text = [
    `Hi ${refName},`,
    ``,
    `Following up regarding ${applicantName}'s application to ${programLabel}. If you're still planning to submit a recommendation, here is your personal upload link:`,
    uploadUrl,
    ``,
    `— The STAIJA Team`,
  ].join('\n')

  return { html, text }
}
