import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeUserName,
  getTimeOfDayGreeting,
  buildPersonalizedGreeting,
  isFastConversationalQuery,
  isGreetingQuery,
  buildNaturalGreetingResponse
} from './greetingUtils';

test('sanitizeUserName extracts valid first name', () => {
  assert.equal(sanitizeUserName('Robert Chen'), 'Robert');
  assert.equal(sanitizeUserName('alice smith'), 'Alice');
  assert.equal(sanitizeUserName('Jean-Luc Picard'), 'Jean-Luc');
  assert.equal(sanitizeUserName('   Grace   '), 'Grace');
});

test('sanitizeUserName rejects email addresses and invalid names', () => {
  assert.equal(sanitizeUserName('robert@example.com'), null);
  assert.equal(sanitizeUserName('user.name@domain.co.uk'), null);
  assert.equal(sanitizeUserName(''), null);
  assert.equal(sanitizeUserName(null), null);
  assert.equal(sanitizeUserName(undefined), null);
  assert.equal(sanitizeUserName('  '), null);
  assert.equal(sanitizeUserName('A'), null); // too short
});

test('getTimeOfDayGreeting maps hours correctly', () => {
  assert.equal(getTimeOfDayGreeting(5).phrase, 'good morning');
  assert.equal(getTimeOfDayGreeting(9).phrase, 'good morning');
  assert.equal(getTimeOfDayGreeting(11).phrase, 'good morning');
  assert.equal(getTimeOfDayGreeting(12).phrase, 'good afternoon');
  assert.equal(getTimeOfDayGreeting(15).phrase, 'good afternoon');
  assert.equal(getTimeOfDayGreeting(16).phrase, 'good afternoon');
  assert.equal(getTimeOfDayGreeting(17).phrase, 'good evening');
  assert.equal(getTimeOfDayGreeting(21).phrase, 'good evening');
  assert.equal(getTimeOfDayGreeting(23).phrase, 'good evening');
  assert.equal(getTimeOfDayGreeting(3).phrase, 'good evening');
});

test('buildPersonalizedGreeting generates correct phrases', () => {
  const morningDate = new Date(2026, 9, 23, 8, 30);
  const afternoonDate = new Date(2026, 9, 23, 14, 0);

  // Authenticated user with name
  const greetingNamed = buildPersonalizedGreeting({ displayName: 'Sarah Connor' }, undefined, morningDate);
  assert.equal(greetingNamed, 'Hey Sarah, good morning! How can I help you today?');

  // Authenticated user with afternoon time
  const greetingAfternoon = buildPersonalizedGreeting({ displayName: 'Marcus' }, undefined, afternoonDate);
  assert.equal(greetingAfternoon, 'Hey Marcus, good afternoon! How can I help you today?');

  // Unauthenticated or email-only user
  const greetingEmailOnly = buildPersonalizedGreeting({ displayName: 'anon@weather.org', email: 'anon@weather.org' }, undefined, morningDate);
  assert.equal(greetingEmailOnly, 'Hey! Good morning. How can I help you today?');

  const greetingGuest = buildPersonalizedGreeting(null, undefined, afternoonDate);
  assert.equal(greetingGuest, 'Hey! Good afternoon. How can I help you today?');
});

test('isGreetingQuery detects wake phrases and greetings', () => {
  assert.equal(isGreetingQuery('Hey Atmos'), true);
  assert.equal(isGreetingQuery('hey atmos!'), true);
  assert.equal(isGreetingQuery('Hello Atmos'), true);
  assert.equal(isGreetingQuery('Hi Atmos'), true);
  assert.equal(isGreetingQuery('hey'), true);
  assert.equal(isGreetingQuery('hello'), true);
  assert.equal(isGreetingQuery('Atmos'), true);

  // Weather questions must NOT match greeting query
  assert.equal(isGreetingQuery("What's the weather like in Kampala?"), false);
  assert.equal(isGreetingQuery('Is it going to rain?'), false);
  assert.equal(isGreetingQuery('Compare weather between Paris and London'), false);
});

test('buildNaturalGreetingResponse generates directive-specified concise response', () => {
  const guestGreeting = buildNaturalGreetingResponse();
  assert.equal(guestGreeting, "Hey! I'm listening. What's on your mind?");

  const namedGreeting = buildNaturalGreetingResponse('David Miller');
  assert.equal(namedGreeting, "Hey David! I'm listening. What's on your mind?");

  const emailGreeting = buildNaturalGreetingResponse('david@example.com');
  assert.equal(emailGreeting, "Hey! I'm listening. What's on your mind?");
});

test('isFastConversationalQuery detects pure greetings and thanks', () => {
  assert.equal(isFastConversationalQuery('hey'), true);
  assert.equal(isFastConversationalQuery('Hello!'), true);
  assert.equal(isFastConversationalQuery('hey atmos'), true);
  assert.equal(isFastConversationalQuery('thanks'), true);
  assert.equal(isFastConversationalQuery('thank you!'), true);

  // Weather queries should NOT match fast conversational query
  assert.equal(isFastConversationalQuery('What is the weather in Kampala?'), false);
  assert.equal(isFastConversationalQuery('Will it rain today?'), false);
  assert.equal(isFastConversationalQuery('Compare Kampala and Entebbe'), false);
});
