export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

// Temporary product gate. Keep the dark/system implementation for reactivation.
export const ALTERNATE_THEMES_ENABLED = false;

export function isThemeOptionAvailable(preference: ThemePreference): boolean {
  return preference === 'light' || ALTERNATE_THEMES_ENABLED;
}

export function availableThemePreference(preference: ThemePreference): ThemePreference {
  return isThemeOptionAvailable(preference) ? preference : 'light';
}

export const themeColors = {
  light: {
    background: '#f8f9ff',
    surface: '#ffffff',
    surfaceSecondary: '#f0f1f7',
    inputBackground: '#ffffff',
    text: '#171528',
    textSecondary: '#74798d',
    placeholder: '#8a8fa2',
    primary: '#5b50f5',
    primaryText: '#ffffff',
    accentText: '#5147df',
    primarySubtle: '#eeecff',
    border: '#e4e6ef',
    error: '#b42336',
    errorSubtle: '#fff1f2',
    success: '#247a55',
    successSubtle: '#e9f8f0',
    warning: '#a34d2b',
    warningSubtle: '#fff4ee',
    tabBar: '#ffffff',
  },
  dark: {
    background: '#111425',
    surface: '#1b2034',
    surfaceSecondary: '#252b42',
    inputBackground: '#22283d',
    text: '#f2f3fb',
    textSecondary: '#b7bdd2',
    placeholder: '#9ba4be',
    primary: '#6658e8',
    primaryText: '#ffffff',
    accentText: '#b4acff',
    primarySubtle: '#302c58',
    border: '#394057',
    error: '#ff9ba7',
    errorSubtle: '#482a39',
    success: '#8addb4',
    successSubtle: '#1e3b36',
    warning: '#ffc199',
    warningSubtle: '#49352f',
    tabBar: '#1b2034',
  },
} as const;

export type ThemeColors = { [K in keyof typeof themeColors.light]: string };

export function resolveTheme(preference: ThemePreference, system: 'light' | 'dark' | 'unspecified' | null | undefined): ResolvedTheme {
  return preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;
}
