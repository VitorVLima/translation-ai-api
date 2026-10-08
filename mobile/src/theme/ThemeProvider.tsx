import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance, useColorScheme } from 'react-native';
import { availableThemePreference, isThemeOptionAvailable, resolveTheme, themeColors, type ResolvedTheme, type ThemeColors, type ThemePreference } from './theme';
import { loadThemePreference, saveThemePreference } from './theme.storage';

type ThemeContextValue = {
  colors: ThemeColors;
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [ready, setReady] = useState(false);
  const activePreference = availableThemePreference(preference);

  useEffect(() => {
    let active = true;
    loadThemePreference().then((stored) => {
      if (active) setPreferenceState(stored);
    }).catch(() => {}).finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (ready) Appearance.setColorScheme(activePreference === 'system' ? 'unspecified' : activePreference);
  }, [activePreference, ready]);

  const setPreference = useCallback(async (next: ThemePreference) => {
    if (!isThemeOptionAvailable(next)) return;
    setPreferenceState(next);
    try {
      await saveThemePreference(next);
    } catch (error) {
      setPreferenceState(preference);
      throw error;
    }
  }, [preference]);

  const resolved = resolveTheme(activePreference, systemScheme);
  const value = useMemo<ThemeContextValue>(() => ({
    colors: themeColors[resolved], preference: activePreference, resolved, setPreference,
  }), [activePreference, resolved, setPreference]);

  if (!ready) return null;
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('ThemeProvider ausente');
  return theme;
}
