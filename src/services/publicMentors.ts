/**
 * Public mentor showcase client.
 *
 * Anonymous fetch of opted-in mentors for /stay-connected. Calls the
 * `getPublicMentors` Cloud Function (HTTP) — anonymous read, edge-
 * cached for 5 minutes. Returns an empty list when the endpoint isn't
 * configured (local dev without the functions emulator), so the
 * showcase always degrades to its empty state instead of throwing.
 */

import { getAppConfig } from '../utils/env';

export interface PublicMentor {
  uid: string;
  displayName: string;
  photoURL: string | null;
  avatarSlot: number | null;
  mentorBio: string;
  mentorAvailability: string;
}

export async function fetchPublicMentors(): Promise<PublicMentor[]> {
  const endpoint = getAppConfig().publicMentorsEndpoint;
  if (!endpoint) return [];

  try {
    const res = await fetch(endpoint, { method: 'GET' });
    if (!res.ok) return [];
    const data = (await res.json()) as { mentors?: PublicMentor[] };
    return Array.isArray(data.mentors) ? data.mentors : [];
  } catch {
    return [];
  }
}
