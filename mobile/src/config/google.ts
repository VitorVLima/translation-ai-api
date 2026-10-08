// Client IDs are public identifiers, never client secrets. The environment
// value lets a development build use the matching Google Cloud configuration.
export const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID?.trim() ||
  '491728559092-frggmogjfh3mmh0kkduuk11053lucfp3.apps.googleusercontent.com';

// Native iOS sign-in needs the iOS OAuth client, while the ID token audience
// remains the Web client consumed by the Backend. Keep both values public and
// configurable; never put a client secret in the app.
export const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() || '';

export const GOOGLE_IOS_REVERSED_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_REVERSED_CLIENT_ID?.trim() || '';
