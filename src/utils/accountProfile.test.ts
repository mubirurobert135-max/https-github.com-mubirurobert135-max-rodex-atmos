import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAuthProfileIdentity } from './accountProfile';

test('uses the Google account name and exact provider photo when signed in with Google', () => {
  const identity = resolveAuthProfileIdentity({
    displayName: 'Alex Johnson',
    photoURL: 'https://firebase.example/avatar',
    providerData: [{
      providerId: 'google.com',
      displayName: 'Alex Johnson',
      photoURL: 'https://lh3.googleusercontent.com/a/alex-profile-photo'
    }]
  });

  assert.equal(identity.displayName, 'Alex Johnson');
  assert.equal(identity.photoURL, 'https://lh3.googleusercontent.com/a/alex-profile-photo');
});

test('uses the current Firebase display name while retaining the linked Google avatar', () => {
  const identity = resolveAuthProfileIdentity({
    displayName: 'Alex RODEX',
    providerData: [{
      providerId: 'google.com',
      displayName: 'Alex Johnson',
      photoURL: 'https://lh3.googleusercontent.com/a/alex-profile-photo'
    }]
  });

  assert.equal(identity.displayName, 'Alex RODEX');
  assert.equal(identity.photoURL, 'https://lh3.googleusercontent.com/a/alex-profile-photo');
});

test('does not invent or fetch a Google photo for a Gmail/password-only account', () => {
  const identity = resolveAuthProfileIdentity({
    displayName: 'Alex Johnson',
    photoURL: null,
    providerData: [{ providerId: 'password', displayName: 'Alex Johnson', photoURL: null }]
  });

  assert.equal(identity.displayName, 'Alex Johnson');
  assert.equal(identity.photoURL, undefined);
});

test('falls back to a non-Google Firebase profile photo when one is explicitly supplied', () => {
  const identity = resolveAuthProfileIdentity({
    displayName: 'Alex Johnson',
    photoURL: 'https://profiles.example/alex.png',
    providerData: [{ providerId: 'password' }]
  });

  assert.equal(identity.photoURL, 'https://profiles.example/alex.png');
});
