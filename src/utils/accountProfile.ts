export interface AuthProfileProvider {
  providerId: string;
  displayName?: string | null;
  photoURL?: string | null;
}

export interface AuthProfileIdentitySource {
  displayName?: string | null;
  photoURL?: string | null;
  providerData?: readonly AuthProfileProvider[];
}

/**
 * Resolve the name and avatar Firebase exposes for the authenticated identity.
 * A linked Google provider is authoritative for the Google profile photo.
 * Never guess a photo from an email address: Gmail/password sign-in alone does
 * not grant access to that Google account's profile image.
 */
export function resolveAuthProfileIdentity(user: AuthProfileIdentitySource): {
  displayName: string;
  photoURL?: string;
} {
  const googleProfile = user.providerData?.find((provider) => provider.providerId === 'google.com');
  return {
    displayName: user.displayName || googleProfile?.displayName || '',
    photoURL: googleProfile?.photoURL || user.photoURL || undefined
  };
}
