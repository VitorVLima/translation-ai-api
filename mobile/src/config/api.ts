// Fallback de desenvolvimento para o Android Emulator.
const configuredUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
const isDevelopment = typeof __DEV__ !== 'undefined' && __DEV__;
const baseUrl = configuredUrl || (isDevelopment ? 'http://10.0.2.2:8080' : '');

if (!baseUrl) throw new Error('EXPO_PUBLIC_API_URL is required outside development');
let parsedUrl: URL;
try {
  parsedUrl = new URL(baseUrl);
} catch {
  throw new Error('EXPO_PUBLIC_API_URL is invalid');
}
if (isDevelopment ? !['http:', 'https:'].includes(parsedUrl.protocol) : parsedUrl.protocol !== 'https:') {
  throw new Error('EXPO_PUBLIC_API_URL must use HTTPS outside development');
}

export const API_URL = baseUrl.replace(/\/+$/, '');
