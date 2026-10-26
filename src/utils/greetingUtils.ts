/**
 * Greeting and conversational routing utilities for RODEX Atmos voice assistant
 */

/**
 * Sanitizes and extracts a user's first name from their profile or display name.
 * Strictly avoids using email addresses or generating fabricated names.
 */
export function sanitizeUserName(rawName?: string | null): string | null {
  if (!rawName || typeof rawName !== 'string') return null;

  const trimmed = rawName.trim();
  if (!trimmed) return null;

  // Never use email address as spoken name
  if (trimmed.includes('@') || /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(trimmed)) {
    return null;
  }

  // Extract first name and strip symbols
  const firstWord = trimmed.split(/\s+/)[0];
  const cleaned = firstWord.replace(/[^a-zA-Z\xC0-\u024F\u1E00-\u1EFF'-]/g, '');

  if (cleaned.length < 2) return null;

  // Capitalize properly
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export type TimeOfDayPeriod = 'morning' | 'afternoon' | 'evening' | 'night';

export interface TimeOfDayInfo {
  period: TimeOfDayPeriod;
  phrase: string;
}

/**
 * Determines the time-of-day greeting based on hour (0-23) or timezone.
 * Schedule:
 * - Morning: 05:00 - 11:59 -> "good morning"
 * - Afternoon: 12:00 - 16:59 -> "good afternoon"
 * - Evening: 17:00 - 21:59 -> "good evening"
 * - Late night: 22:00 - 04:59 -> "good evening"
 */
export function getTimeOfDayGreeting(
  reference?: Date | number,
  timeZone?: string
): TimeOfDayInfo {
  let hour = 12;

  if (typeof reference === 'number') {
    hour = reference;
  } else {
    const date = reference instanceof Date ? reference : new Date();
    if (timeZone && timeZone !== 'auto') {
      try {
        const parts = new Intl.DateTimeFormat('en-US', {
          hour: 'numeric',
          hour12: false,
          timeZone
        }).formatToParts(date);
        const hourPart = parts.find((p) => p.type === 'hour');
        if (hourPart) {
          hour = parseInt(hourPart.value, 10);
        }
      } catch {
        hour = date.getHours();
      }
    } else {
      hour = date.getHours();
    }
  }

  if (hour >= 5 && hour < 12) {
    return { period: 'morning', phrase: 'good morning' };
  } else if (hour >= 12 && hour < 17) {
    return { period: 'afternoon', phrase: 'good afternoon' };
  } else if (hour >= 17 && hour < 22) {
    return { period: 'evening', phrase: 'good evening' };
  } else {
    // 22:00 to 04:59
    return { period: 'night', phrase: 'good evening' };
  }
}

/**
 * Generates the personalized, time-aware voice greeting string.
 */
export function buildPersonalizedGreeting(
  user?: { displayName?: string | null; email?: string | null } | null,
  timeZone?: string,
  referenceDate?: Date
): string {
  const name = sanitizeUserName(user?.displayName);
  const { phrase } = getTimeOfDayGreeting(referenceDate, timeZone);

  if (name) {
    return `Hey ${name}, ${phrase}! How can I help you today?`;
  }

  const capitalizedPhrase = phrase.charAt(0).toUpperCase() + phrase.slice(1);
  return `Hey! ${capitalizedPhrase}. How can I help you today?`;
}

/**
 * Checks if a user's utterance is specifically a greeting or wake phrase (e.g. "Hey Atmos", "Hello", "Hi Atmos").
 */
export function isGreetingQuery(text: string): boolean {
  if (!text) return false;
  const cleaned = text.trim().toLowerCase().replace(/[!?.,;]+$/, '');
  const greetingPattern = /^(?:hey|hi|hello|hey atmos|hi atmos|hello atmos|atmos|hey there|good morning|good afternoon|good evening|good day|howdy|sup|greetings|what's up)$/i;
  return greetingPattern.test(cleaned);
}

/**
 * Generates the natural, conversational response for "Hey Atmos" or friendly greetings as specified
 * in Directive Section 3: "Hey! I'm listening. What's on your mind?"
 */
export function buildNaturalGreetingResponse(userName?: string | null): string {
  if (userName) {
    const cleanName = sanitizeUserName(userName);
    if (cleanName) {
      return `Hey ${cleanName}! I'm listening. What's on your mind?`;
    }
  }
  return "Hey! I'm listening. What's on your mind?";
}

/**
 * Checks if a user's utterance is purely conversational (greeting or gratitude)
 * so the assistant can respond promptly without invoking external weather APIs.
 */
export function isFastConversationalQuery(text: string): boolean {
  if (!text) return false;
  const cleaned = text.trim().toLowerCase().replace(/[!?.,;]+$/, '');

  const pureGreetingPattern = /^(?:hey|hi|hello|hey atmos|hi atmos|hello atmos|atmos|hey there|good morning|good afternoon|good evening|good day|howdy|sup|greetings|what's up)$/i;
  const pureThanksPattern = /^(?:thanks|thank you|thanks atmos|thank you atmos|thanks a lot|much appreciated)$/i;

  return pureGreetingPattern.test(cleaned) || pureThanksPattern.test(cleaned);
}
