import type { UserResponse } from '../auth/auth.types';
import type { AvatarResponse, EnglishLevel, ProfileResponse } from './profile.types';
import { translate } from '../../i18n/translate';

export function getEnglishLevelName(level: EnglishLevel): string {
  return translate(`setup.level.${level}`);
}

function cleanName(value: string | null | undefined): string {
  return value?.trim() ?? '';
}

function avatarUrl(profile: ProfileResponse | null, avatars: AvatarResponse[], apiUrl: string): string | null {
  const path = avatars.find((avatar) => avatar.key === profile?.avatarKey)?.imageUrl;
  if (!path) return null;
  try {
    return new URL(path, `${apiUrl}/`).toString();
  } catch {
    return null;
  }
}

export type HomeProfilePresentation = {
  displayName: string;
  firstName: string;
  initial: string;
  levelLabel: string;
  levelValue: string;
  levelDescription: string;
  avatarImageUrl: string | null;
  showCompletion: boolean;
};

export function getHomeProfilePresentation(
  user: Pick<UserResponse, 'username'> | null,
  profile: ProfileResponse | null,
  avatars: AvatarResponse[],
  apiUrl: string,
): HomeProfilePresentation {
  const displayName = cleanName(profile?.preferredName) || cleanName(user?.username);
  const firstName = displayName.split(/\s+/)[0] ?? '';
  return {
    displayName,
    firstName,
    initial: firstName.charAt(0).toLocaleUpperCase('pt-BR'),
    levelLabel: profile?.englishLevel ? `${profile.englishLevel} · ${getEnglishLevelName(profile.englishLevel)}` : translate('common.notProvided'),
    levelValue: profile?.englishLevel ?? '—',
    levelDescription: profile?.englishLevel ? getEnglishLevelName(profile.englishLevel) : translate('common.notProvided'),
    avatarImageUrl: avatarUrl(profile, avatars, apiUrl),
    showCompletion: profile?.onboardingStatus === 'PENDING',
  };
}
