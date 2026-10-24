import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  escapeIcsText,
  foldIcsLine,
  formatIcsDate,
  generateIcsCalendar,
  getGoogleCalendarUrl,
  getOutlookLiveUrl,
  getOffice365Url,
  getYahooCalendarUrl,
  resolveDate,
  sessionToCalendarEvent,
  type CalendarEventInput,
} from '../../src/services/calendarExport';
import type { LiveSession } from '../../src/services/types';

describe('Calendar Export & Session Reminders Service', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-24T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Date formatting & resolution', () => {
    it('formats UTC dates into RFC 5545 format YYYYMMDDTHHmmssZ', () => {
      const d = new Date('2026-10-25T14:30:00Z');
      expect(formatIcsDate(d)).toBe('20261025T143000Z');
    });

    it('resolves native Date, Firestore Timestamps, and ISO strings', () => {
      const now = new Date('2026-10-25T10:00:00Z');
      expect(resolveDate(now)).toEqual(now);

      const firestoreTs = { toDate: () => now };
      expect(resolveDate(firestoreTs)).toEqual(now);

      const secondsObj = { seconds: 1792860000 };
      expect(resolveDate(secondsObj)).toEqual(new Date(1792860000 * 1000));

      const isoStr = '2026-10-25T10:00:00.000Z';
      expect(resolveDate(isoStr)).toEqual(now);

      expect(resolveDate(null, 1000)).toEqual(new Date(1000));
    });
  });

  describe('Text escaping & line folding', () => {
    it('escapes backslashes, semicolons, commas, and newlines', () => {
      const raw = 'Math, Science; Physics\\Chemistry\nNew Line';
      const escaped = escapeIcsText(raw);
      expect(escaped).toBe('Math\\, Science\\; Physics\\\\Chemistry\\nNew Line');
    });

    it('folds lines longer than 75 octets with CRLF followed by a space', () => {
      const short = 'SUMMARY:Quick meeting';
      expect(foldIcsLine(short)).toBe(short);

      const long =
        'DESCRIPTION:This is a very comprehensive research methodology session designed for African StepUp Scholars studying experimental biology, molecular dynamics, and computational simulation.';
      const folded = foldIcsLine(long, 75);
      expect(folded).toContain('\r\n ');
      // Each segment should be <= 75 bytes
      const segments = folded.split('\r\n');
      for (const seg of segments) {
        expect(new TextEncoder().encode(seg).length).toBeLessThanOrEqual(75);
      }
    });
  });

  describe('Single and multi-event ICS generation', () => {
    const mockEvent: CalendarEventInput = {
      id: 'session-123',
      title: 'StepUp Research Methodology Office Hours',
      description: 'Discussing experimental controls and hypotheses.',
      startsAt: new Date('2026-10-26T15:00:00Z'),
      endsAt: new Date('2026-10-26T16:00:00Z'),
      location: 'https://meet.google.com/abc-defg-hij',
      meetingUrl: 'https://meet.google.com/abc-defg-hij',
      url: 'https://staging.staija.org/learn/session/session-123',
      organizer: {
        name: 'STAIJA LMS',
        email: 'noreply@staija.org',
      },
      remindersMinutes: [15, 1440],
    };

    it('generates a valid RFC 5545 VCALENDAR structure', () => {
      const ics = generateIcsCalendar(mockEvent);

      expect(ics).toContain('BEGIN:VCALENDAR\r\n');
      expect(ics).toContain('VERSION:2.0\r\n');
      expect(ics).toContain('PRODID:-//STAIJA//STAIJA LMS//EN\r\n');
      expect(ics).toContain('CALSCALE:GREGORIAN\r\n');
      expect(ics).toContain('METHOD:PUBLISH\r\n');
      expect(ics).toContain('BEGIN:VEVENT\r\n');
      expect(ics).toContain('UID:session-123@staija.org\r\n');
      expect(ics).toContain('DTSTART:20261026T150000Z\r\n');
      expect(ics).toContain('DTEND:20261026T160000Z\r\n');
      expect(ics).toContain('SUMMARY:StepUp Research Methodology Office Hours\r\n');
      expect(ics).toContain('LOCATION:https://meet.google.com/abc-defg-hij\r\n');
      expect(ics).toContain('STATUS:CONFIRMED\r\n');
      expect(ics).toContain('ORGANIZER;CN=STAIJA LMS:mailto:noreply@staija.org\r\n');

      // Alarms
      expect(ics).toContain('BEGIN:VALARM\r\n');
      expect(ics).toContain('TRIGGER:-PT15M\r\n');
      expect(ics).toContain('TRIGGER:-P1D\r\n');
      expect(ics).toContain('END:VALARM\r\n');

      expect(ics).toContain('END:VEVENT\r\n');
      expect(ics).toContain('END:VCALENDAR\r\n');
    });

    it('supports multiple events in a single calendar subscription file', () => {
      const ev1: CalendarEventInput = {
        id: 'ev-1',
        title: 'Session 1',
        startsAt: new Date('2026-10-26T10:00:00Z'),
        endsAt: new Date('2026-10-26T11:00:00Z'),
      };
      const ev2: CalendarEventInput = {
        id: 'ev-2',
        title: 'Session 2',
        startsAt: new Date('2026-10-28T10:00:00Z'),
        endsAt: new Date('2026-10-28T11:00:00Z'),
      };

      const ics = generateIcsCalendar([ev1, ev2], 'Dynamerge Bootcamp 2026');
      expect(ics).toContain('X-WR-CALNAME:Dynamerge Bootcamp 2026\r\n');
      expect(ics).toContain('UID:ev-1@staija.org\r\n');
      expect(ics).toContain('UID:ev-2@staija.org\r\n');
      const eventCount = (ics.match(/BEGIN:VEVENT/g) || []).length;
      expect(eventCount).toBe(2);
    });

    it('converts LiveSession to CalendarEventInput cleanly', () => {
      const session: LiveSession = {
        id: 'sess-99',
        cohortId: 'cohort-1',
        courseSlug: 'stepup-research',
        title: 'Live Lab Discussion',
        description: 'Bring questions on lab safety and protocols.',
        startsAt: new Date('2026-10-27T14:00:00Z'),
        endsAt: new Date('2026-10-27T15:00:00Z'),
        meetingUrl: 'https://zoom.us/j/123456789',
        meetingProvider: 'zoom',
        hostUid: 'mentor-1',
        status: 'scheduled',
        createdAt: new Date('2026-10-20T10:00:00Z'),
        createdBy: 'mentor-1',
      };

      const event = sessionToCalendarEvent(session, 'https://staging.staija.org');
      expect(event.id).toBe('sess-99');
      expect(event.title).toBe('Live Lab Discussion');
      expect(event.description).toContain('Bring questions on lab safety');
      expect(event.description).toContain('Meeting Link (ZOOM): https://zoom.us/j/123456789');
      expect(event.description).toContain(
        'Session details: https://staging.staija.org/learn/session/sess-99',
      );
      expect(event.location).toBe('https://zoom.us/j/123456789');
      expect(event.remindersMinutes).toEqual([15, 1440]);
    });
  });

  describe('Deep links for web calendar providers', () => {
    const event: CalendarEventInput = {
      title: 'Biochemistry Seminar',
      description: 'Intro to enzyme kinetics',
      startsAt: new Date('2026-10-26T13:00:00Z'),
      endsAt: new Date('2026-10-26T14:30:00Z'),
      location: 'Lab Room 304',
    };

    it('builds a valid Google Calendar deep link', () => {
      const url = getGoogleCalendarUrl(event);
      expect(url).toContain('calendar.google.com/calendar/render');
      expect(url).toContain('action=TEMPLATE');
      expect(url).toContain('text=Biochemistry+Seminar');
      expect(url).toContain('dates=20261026T130000Z%2F20261026T143000Z');
      expect(url).toContain('details=Intro+to+enzyme+kinetics');
      expect(url).toContain('location=Lab+Room+304');
    });

    it('builds a valid Outlook Live deep link', () => {
      const url = getOutlookLiveUrl(event);
      expect(url).toContain('outlook.live.com/calendar/0/action/compose');
      expect(url).toContain('rru=addevent');
      expect(url).toContain('subject=Biochemistry+Seminar');
      expect(url).toContain('startdt=2026-10-26T13%3A00%3A00.000Z');
      expect(url).toContain('enddt=2026-10-26T14%3A30%3A00.000Z');
      expect(url).toContain('location=Lab+Room+304');
    });

    it('builds a valid Office 365 deep link', () => {
      const url = getOffice365Url(event);
      expect(url).toContain('outlook.office.com/calendar/0/action/compose');
      expect(url).toContain('subject=Biochemistry+Seminar');
    });

    it('builds a valid Yahoo Calendar deep link', () => {
      const url = getYahooCalendarUrl(event);
      expect(url).toContain('calendar.yahoo.com');
      expect(url).toContain('v=60');
      expect(url).toContain('title=Biochemistry+Seminar');
      expect(url).toContain('st=20261026T130000Z');
      expect(url).toContain('et=20261026T143000Z');
      expect(url).toContain('in_loc=Lab+Room+304');
    });
  });
});
