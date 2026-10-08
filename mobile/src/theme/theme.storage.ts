import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { ThemePreference } from './theme';

const THEME_PREFERENCE_KEY = 'englishai.theme.preference';

function parsePreference(value: string | null): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system';
}

export async function loadThemePreference(): Promise<ThemePreference> {
  if (Platform.OS === 'web') return parsePreference(globalThis.localStorage?.getItem(THEME_PREFERENCE_KEY) ?? null);
  return parsePreference(await SecureStore.getItemAsync(THEME_PREFERENCE_KEY));
}

export async function saveThemePreference(preference: ThemePreference): Promise<void> {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.setItem(THEME_PREFERENCE_KEY, preference);
    return;
  }
  await SecureStore.setItemAsync(THEME_PREFERENCE_KEY, preference);
}
