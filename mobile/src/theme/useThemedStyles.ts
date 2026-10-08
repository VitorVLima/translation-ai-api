import { useMemo } from 'react';
import { StyleSheet, type TextStyle, type ViewStyle, type ImageStyle } from 'react-native';
import { useTheme } from './ThemeProvider';
import { themeColors, type ThemeColors } from './theme';

type Style = ViewStyle | TextStyle | ImageStyle;

function rgb(hex: string): [number, number, number] | null {
  const value = hex.toLowerCase();
  if (!/^#[0-9a-f]{3}$|^#[0-9a-f]{6}$/.test(value)) return null;
  const full = value.length === 4 ? value.slice(1).split('').map((part) => part + part).join('') : value.slice(1);
  return [0, 2, 4].map((start) => Number.parseInt(full.slice(start, start + 2), 16)) as [number, number, number];
}

/** Adapts the existing light palette by semantic paint role, leaving study/chart colors intact. */
export function adaptColor(value: string, role: 'backgroundColor' | 'borderColor' | 'color', colors: ThemeColors): string {
  if (colors === themeColors.light) return value;
  const normalized = value.toLowerCase();
  if (role === 'backgroundColor') {
    if (['#eeecff', '#ebe8ff', '#efedff', '#f0eeff', '#f4f2ff', '#f5f3ff', '#ece9ff'].includes(normalized)) return colors.primarySubtle;
    if (['#fff1f2', '#fff1f1', '#ffe9eb'].includes(normalized)) return colors.errorSubtle;
    if (['#e9f8f0', '#e9f7ef'].includes(normalized)) return colors.successSubtle;
    if (['#fff4ee', '#fff5ef'].includes(normalized)) return colors.warningSubtle;
  }
  const channels = rgb(value);
  if (!channels) return value;
  const [red, green, blue] = channels;
  const max = Math.max(...channels);
  const min = Math.min(...channels);
  const saturation = max - min;
  const brightness = (red + green + blue) / 3;
  const bluePurple = blue > green * 1.12 && blue > red * 1.08;
  const purple = blue > green * 1.13 && red > green * 0.7;
  const reddish = red > green * 1.2 && red > blue * 1.15;
  const greenish = green > red * 1.18 && green > blue * 1.04;
  const warm = red > blue * 1.2 && green > blue * 1.1;

  if (role === 'backgroundColor') {
    if (normalized === '#f8f9ff') return colors.background;
    if (normalized === '#fff' || normalized === '#ffffff') return colors.surface;
    if (brightness > 212 && saturation < 45) return colors.surfaceSecondary;
    if (brightness > 208 && purple) return colors.primarySubtle;
    if (brightness > 208 && reddish) return colors.errorSubtle;
    if (brightness > 208 && greenish) return colors.successSubtle;
    if (brightness > 208 && warm) return colors.warningSubtle;
    if (brightness < 195 && purple && saturation > 50) return colors.primary;
    return value;
  }
  if (role === 'borderColor') {
    if (brightness > 190 && saturation < 65) return colors.border;
    if (purple) return colors.primary;
    if (reddish) return colors.error;
    if (greenish) return colors.success;
    return value;
  }
  if (brightness > 245 && saturation < 15) return value; // White on filled buttons and illustrated cards.
  if (brightness < 78 && saturation < 55) return colors.text;
  if (brightness < 160 && saturation < 55) return colors.textSecondary;
  if (purple || bluePurple) return colors.accentText;
  if (reddish) return colors.error;
  if (greenish) return colors.success;
  if (warm && brightness < 185) return colors.warning;
  return value;
}

export function useThemedStyles<T extends Record<string, Style>>(baseStyles: T): T {
  const { colors, resolved } = useTheme();
  return useMemo(() => {
    if (resolved === 'light') return baseStyles;
    return Object.fromEntries(Object.entries(baseStyles).map(([key, value]) => {
      const flattened = StyleSheet.flatten(value) as Record<string, unknown>;
      const adapted = { ...flattened };
      for (const role of ['backgroundColor', 'borderColor', 'borderTopColor', 'borderBottomColor', 'borderLeftColor', 'borderRightColor', 'color'] as const) {
        if (typeof adapted[role] === 'string') adapted[role] = adaptColor(adapted[role], role === 'color' ? 'color' : role === 'backgroundColor' ? 'backgroundColor' : 'borderColor', colors);
      }
      return [key, adapted];
    })) as unknown as T;
  }, [baseStyles, colors, resolved]);
}
