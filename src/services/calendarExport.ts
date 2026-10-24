import type { LiveSession } from './types';

export interface CalendarEventInput {
  id?: string;
  title: string;
  description?: string;
  startsAt: Date | number | string | { toDate?: () => Date } | { seconds: number };
  endsAt?: Date | number | string | { toDate?: () => Date } | { seconds: number };
  location?: string;
  meetingUrl?: string;
  url?: string;
  remindersMinutes?: number[];
  organizer?: {
    name: string;
    email: string;
  };
}

/**
 * Resolves various Date/Timestamp representations to a native Date object.
 */
export function resolveDate(
  value: Date | number | string | { toDate?: () => Date } | { seconds: number } | null | undefined,
  fallbackMs?: number,
): Date {
  if (value instanceof Date) return value;
  if (value && typeof value === 'object') {
    if ('toDate' in value && typeof value.toDate === 'function') {
      return value.toDate();
    }
    if ('seconds' in value && typeof value.seconds === 'number') {
      return new Date(value.seconds * 1000);
    }
  }
  if (typeof value === 'number' || typeof value === 'string') {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d;
  }
  return fallbackMs !== undefined ? new Date(fallbackMs) : new Date();
}

/**
 * Formats a Date into UTC iCalendar timestamp: YYYYMMDDTHHmmssZ
 */
export function formatIcsDate(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());
  const hours = pad(date.getUTCHours());
  const minutes = pad(date.getUTCMinutes());
  const seconds = pad(date.getUTCSeconds());
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

/**
 * Escapes special characters for iCalendar text fields (RFC 5545).
 */
export function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * Folds lines longer than 75 octets per RFC 5545 section 3.1.
 */
export function foldIcsLine(line: string, maxBytes = 75): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= maxBytes) {
    return line;
  }

  const chunks: string[] = [];
  let remaining = line;
  let isFirst = true;

  while (remaining.length > 0) {
    const limit = isFirst ? maxBytes : maxBytes - 1;
    let sliceEnd = 0;
    let byteCount = 0;
    while (sliceEnd < remaining.length) {
      const charBytes = encoder.encode(remaining[sliceEnd]).length;
      if (byteCount + charBytes > limit) break;
      byteCount += charBytes;
      sliceEnd++;
    }
    if (sliceEnd === 0) {
      sliceEnd = 1;
    }
    const chunk = remaining.slice(0, sliceEnd);
    chunks.push(isFirst ? chunk : ` ${chunk}`);
    remaining = remaining.slice(sliceEnd);
    isFirst = false;
  }

  return chunks.join('\r\n');
}

/**
 * Converts minutes offset into an iCalendar ISO 8601 duration string (e.g. -PT15M, -P1D).
 */
function toIcsTriggerDuration(minutes: number): string {
  if (minutes % 1440 === 0 && minutes > 0) {
    return `-P${minutes / 1440}D`;
  }
  if (minutes % 60 === 0 && minutes > 0) {
    return `-PT${minutes / 60}H`;
  }
  return `-PT${Math.max(1, Math.round(minutes))}M`;
}

/**
 * Converts a LiveSession object into a normalized CalendarEventInput.
 */
export function sessionToCalendarEvent(
  session: LiveSession,
  appBaseUrl = 'https://staija.org',
): CalendarEventInput {
  const start = resolveDate(session.startsAt);
  const end = resolveDate(session.endsAt, start.getTime() + 60 * 60 * 1000);

  const lines: string[] = [];
  if (session.description) {
    lines.push(session.description.trim());
  }
  if (session.meetingUrl) {
    const provider = session.meetingProvider
      ? session.meetingProvider.toUpperCase()
      : 'VIDEO CONFERENCE';
    lines.push(`\nMeeting Link (${provider}): ${session.meetingUrl}`);
  }
  if (session.id) {
    lines.push(`Session details: ${appBaseUrl}/learn/session/${session.id}`);
  }

  return {
    id: session.id,
    title: session.title,
    description: lines.join('\n'),
    startsAt: start,
    endsAt: end,
    location: session.meetingUrl || 'Online (STAIJA LMS)',
    meetingUrl: session.meetingUrl,
    url: session.id ? `${appBaseUrl}/learn/session/${session.id}` : undefined,
    organizer: {
      name: 'STAIJA LMS',
      email: 'noreply@staija.org',
    },
    remindersMinutes: [15, 1440], // 15 mins before and 1 day before
  };
}

/**
 * Generates an RFC 5545 VEVENT block for an event.
 */
function buildVEvent(event: CalendarEventInput, nowUtc: string): string[] {
  const start = resolveDate(event.startsAt);
  const end = resolveDate(event.endsAt, start.getTime() + 60 * 60 * 1000);
  const uid = event.id
    ? `${event.id}@staija.org`
    : `staija_${start.getTime()}_${Math.random().toString(36).substring(2, 9)}@staija.org`;

  const lines: string[] = [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${nowUtc}`,
    `DTSTART:${formatIcsDate(start)}`,
    `DTEND:${formatIcsDate(end)}`,
    foldIcsLine(`SUMMARY:${escapeIcsText(event.title)}`),
    'STATUS:CONFIRMED',
  ];

  if (event.description) {
    lines.push(foldIcsLine(`DESCRIPTION:${escapeIcsText(event.description)}`));
  }
  if (event.location) {
    lines.push(foldIcsLine(`LOCATION:${escapeIcsText(event.location)}`));
  }
  if (event.url) {
    lines.push(foldIcsLine(`URL:${escapeIcsText(event.url)}`));
  }

  if (event.organizer) {
    lines.push(
      foldIcsLine(
        `ORGANIZER;CN=${escapeIcsText(event.organizer.name)}:mailto:${event.organizer.email}`,
      ),
    );
  }

  // Reminders / alarms
  const reminders = event.remindersMinutes ?? [15, 1440];
  for (const mins of reminders) {
    lines.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      foldIcsLine(`DESCRIPTION:Reminder: ${escapeIcsText(event.title)}`),
      `TRIGGER:${toIcsTriggerDuration(mins)}`,
      'END:VALARM',
    );
  }

  lines.push('END:VEVENT');
  return lines;
}

/**
 * Generates an RFC 5545 compliant .ics string for one or multiple events.
 */
export function generateIcsCalendar(
  events: CalendarEventInput | CalendarEventInput[],
  calendarName = 'STAIJA Cohort Sessions',
): string {
  const eventList = Array.isArray(events) ? events : [events];
  const nowUtc = formatIcsDate(new Date());

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//STAIJA//STAIJA LMS//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    foldIcsLine(`X-WR-CALNAME:${escapeIcsText(calendarName)}`),
  ];

  for (const ev of eventList) {
    lines.push(...buildVEvent(ev, nowUtc));
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

/**
 * Deep link for Google Calendar web interface.
 */
export function getGoogleCalendarUrl(event: CalendarEventInput): string {
  const start = resolveDate(event.startsAt);
  const end = resolveDate(event.endsAt, start.getTime() + 60 * 60 * 1000);

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${formatIcsDate(start)}/${formatIcsDate(end)}`,
  });

  if (event.description) {
    params.set('details', event.description);
  }
  if (event.location) {
    params.set('location', event.location);
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Deep link for Microsoft Outlook Web / Live.
 */
export function getOutlookLiveUrl(event: CalendarEventInput): string {
  const start = resolveDate(event.startsAt);
  const end = resolveDate(event.endsAt, start.getTime() + 60 * 60 * 1000);

  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: event.title,
    startdt: start.toISOString(),
    enddt: end.toISOString(),
  });

  if (event.description) {
    params.set('body', event.description);
  }
  if (event.location) {
    params.set('location', event.location);
  }

  return `https://outlook.live.com/calendar/0/action/compose?${params.toString()}`;
}

/**
 * Deep link for Microsoft Office 365 Calendar.
 */
export function getOffice365Url(event: CalendarEventInput): string {
  const start = resolveDate(event.startsAt);
  const end = resolveDate(event.endsAt, start.getTime() + 60 * 60 * 1000);

  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: event.title,
    startdt: start.toISOString(),
    enddt: end.toISOString(),
  });

  if (event.description) {
    params.set('body', event.description);
  }
  if (event.location) {
    params.set('location', event.location);
  }

  return `https://outlook.office.com/calendar/0/action/compose?${params.toString()}`;
}

/**
 * Deep link for Yahoo Calendar.
 */
export function getYahooCalendarUrl(event: CalendarEventInput): string {
  const start = resolveDate(event.startsAt);
  const end = resolveDate(event.endsAt, start.getTime() + 60 * 60 * 1000);

  const params = new URLSearchParams({
    v: '60',
    title: event.title,
    st: formatIcsDate(start),
    et: formatIcsDate(end),
  });

  if (event.description) {
    params.set('desc', event.description);
  }
  if (event.location) {
    params.set('in_loc', event.location);
  }

  return `https://calendar.yahoo.com/?${params.toString()}`;
}

/**
 * Browser file download trigger for generated .ics content.
 */
export function downloadIcsFile(filename: string, icsContent: string): void {
  const sanitized = filename.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
  const fullName = sanitized.endsWith('.ics') ? sanitized : `${sanitized}.ics`;
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', fullName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
