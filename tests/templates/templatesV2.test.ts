import { describe, it, expect } from 'vitest'
import {
  applicationReceivedEmail,
  applicationAcceptedEmail,
  applicationRejectedEmail,
  spotReOfferedEmail,
  referenceInviteEmail,
  referenceLetterReceivedEmail,
  welcomeEmail,
  enrollmentEmail,
  submissionGradedEmail,
  sessionInviteEmail,
  accountDeletedEmail,
  newApplicationStaffNotificationEmail,
  referenceReminderEmail,
  notifyMeWelcomeEmail,
  nextCycleOpenedEmail,
  mentorIntroEmail,
} from '../../functions/src/templates'

describe('V5 Clean Human Email Templates', () => {
  it('renders applicationReceivedEmail with human copy and realistic ID', () => {
    const res = applicationReceivedEmail({
      firstName: 'Ada',
      programLabel: 'StepUp Scholars',
      applicationId: '#STJ-2026-8942',
    })
    expect(res.html).toContain('We received your application.')
    expect(res.html).toContain('StepUp Scholars')
    expect(res.html).toContain('#STJ-2026-8942')
    expect(res.html).toContain('The STAIJA Team')
    expect(res.text).toContain('Hi Ada')
  })

  it('renders applicationAcceptedEmail with gold masthead and realistic ID', () => {
    const res = applicationAcceptedEmail({
      firstName: 'Chidi',
      programLabel: 'Dynamerge',
      applicationId: '#STJ-2026-4190',
    })
    expect(res.html).toContain('Welcome to the Dynamerge cohort.')
    expect(res.html).toContain('masthead-gold-v1.png')
    expect(res.html).toContain('ACCEPTED')
    expect(res.html).toContain('#STJ-2026-4190')
    expect(res.html).toContain('Dr. Amina Yusuf')
    expect(res.text).toContain('accepted')
  })

  it('renders referenceInviteEmail with sky masthead', () => {
    const res = referenceInviteEmail({
      refName: 'Dr. Okonjo',
      applicantName: 'Tunde',
      programLabel: 'StepUp Scholars',
      relationship: 'Research Advisor',
      institution: 'University of Lagos',
      uploadUrl: 'https://staija.org/ref/upload?token=abc',
    })
    expect(res.html).toContain('Dr. Okonjo')
    expect(res.html).toContain('masthead-sky-v1.png')
    expect(res.html).toContain('Upload Recommendation')
    expect(res.text).toContain('https://staija.org/ref/upload?token=abc')
  })

  it('renders newsletter notifyMeWelcomeEmail with scholar spotlight', () => {
    const res = notifyMeWelcomeEmail({ interestTag: 'stepup-next' })
    expect(res.subject).toBe("You're on the STAIJA list.")
    expect(res.html).toContain('StepUp Scholars')
    expect(res.html).toContain('Dr. Amina Yusuf')
    expect(res.html).toContain('portrait-1.png')
  })

  it('renders nextCycleOpenedEmail', () => {
    const res = nextCycleOpenedEmail({
      programLabel: 'Dynamerge',
      applyUrl: 'https://staija.org/apply/dynamerge',
      applicationEnd: 'August 15',
    })
    expect(res.subject).toBe('Dynamerge applications are open.')
    expect(res.html).toContain('August 15')
  })

  it('renders mentorIntroEmail with authentic copy', () => {
    const res = mentorIntroEmail({ inviteUrl: 'https://staija.org/mentor/invite/123' })
    expect(res.subject).toContain('Mentoring at STAIJA')
    expect(res.html).toContain('Accept Mentor Invite')
    expect(res.html).toContain('Sarah Nwachukwu')
    expect(res.html).toContain('portrait-3.png')
  })
})
