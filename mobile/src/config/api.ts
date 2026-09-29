// Fallback de desenvolvimento para o Android Emulator.
const configuredUrl = process.env.EXPO_PUBLIC_API_URL?.trim();

export const API_URL = (configuredUrl || 'http://10.0.2.2:8080').replace(/\/+$/, '');
