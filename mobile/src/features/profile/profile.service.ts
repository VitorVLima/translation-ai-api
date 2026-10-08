import { authenticatedFetch } from '../../api/authenticated-fetch';
import type {
  AvatarResponse,
  AvatarType,
  EnglishLevel,
  LearningGoal,
  OnboardingStatus,
  ProfileResponse,
} from './profile.types';

const ENGLISH_LEVELS: EnglishLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const LEARNING_GOALS: LearningGoal[] = ['GENERAL', 'CONVERSATION', 'WORK', 'TRAVEL', 'STUDY'];
const AVATAR_TYPES: AvatarType[] = ['PREDEFINED', 'CUSTOM'];
const ONBOARDING_STATUSES: OnboardingStatus[] = ['PENDING', 'DISMISSED', 'COMPLETED'];

export class ProfileLoadError extends Error {
  constructor() {
    super('profile-load-failed');
    this.name = 'ProfileLoadError';
  }
}

export class ProfileUpdateError extends Error {
  constructor() {
    super('profile-update-failed');
    this.name = 'ProfileUpdateError';
  }
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function enumValue<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && values.includes(value as T);
}

function isProfileResponse(value: unknown): value is ProfileResponse {
  if (!value || typeof value !== 'object') return false;
  const profile = value as Partial<ProfileResponse>;
  return nullableString(profile.preferredName) &&
    nullableString(profile.birthDate) &&
    (profile.age === null || typeof profile.age === 'number') &&
    (profile.englishLevel === null || enumValue(profile.englishLevel, ENGLISH_LEVELS)) &&
    (profile.learningGoal === null || enumValue(profile.learningGoal, LEARNING_GOALS)) &&
    enumValue(profile.avatarType, AVATAR_TYPES) &&
    nullableString(profile.avatarKey) &&
    typeof profile.onboardingCompleted === 'boolean' &&
    enumValue(profile.onboardingStatus, ONBOARDING_STATUSES) &&
    typeof profile.initialSetupCompleted === 'boolean' &&
    typeof profile.createdAt === 'string' &&
    typeof profile.updatedAt === 'string';
}

function isAvatarResponse(value: unknown): value is AvatarResponse {
  if (!value || typeof value !== 'object') return false;
  const avatar = value as Partial<AvatarResponse>;
  return typeof avatar.key === 'string' &&
    typeof avatar.displayName === 'string' &&
    typeof avatar.imageUrl === 'string';
}

async function loadAvatars(signal?: AbortSignal): Promise<AvatarResponse[]> {
  const response = await authenticatedFetch('/api/v1/avatars', { signal });
  if (!response.ok) throw new ProfileLoadError();
  const body: unknown = await response.json();
  if (!Array.isArray(body) || !body.every(isAvatarResponse)) throw new ProfileLoadError();
  return body.filter((avatar) => avatar.key === 'avatar_default' || /^avatar_0[1-6]$/.test(avatar.key));
}

export function getPredefinedAvatars(signal?: AbortSignal): Promise<AvatarResponse[]> {
  return loadAvatars(signal);
}

export type HomeProfileData = {
  profile: ProfileResponse;
  avatars: AvatarResponse[];
};

export async function getProfile(signal?: AbortSignal): Promise<ProfileResponse> {
  const response = await authenticatedFetch('/api/v1/users/me/profile', { signal });
  if (!response.ok) throw new ProfileLoadError();

  let profile: unknown;
  try {
    profile = await response.json();
  } catch {
    throw new ProfileLoadError();
  }
  if (!isProfileResponse(profile)) throw new ProfileLoadError();
  return profile;
}

export type ProfileUpdateRequest = {
  preferredName: string | null;
  birthDate: string | null;
  englishLevel: EnglishLevel | null;
  learningGoal: LearningGoal | null;
};

export type InitialSetupRequest = {
  name: string;
  birthDate: string;
  englishLevel: EnglishLevel;
  learningGoal: LearningGoal;
  avatarKey: string;
};

async function parseProfileResponse(response: Response): Promise<ProfileResponse> {
  if (!response.ok) throw new ProfileUpdateError();
  let profile: unknown;
  try {
    profile = await response.json();
  } catch {
    throw new ProfileUpdateError();
  }
  if (!isProfileResponse(profile)) throw new ProfileUpdateError();
  return profile;
}

export async function updateProfile(request: ProfileUpdateRequest): Promise<ProfileResponse> {
  const response = await authenticatedFetch('/api/v1/users/me/profile', {
    body: JSON.stringify(request),
    headers: { 'Content-Type': 'application/json' },
    method: 'PUT',
  });
  return parseProfileResponse(response);
}

export async function completeInitialSetup(request: InitialSetupRequest): Promise<ProfileResponse> {
  const response = await authenticatedFetch('/api/v1/users/me/profile/initial-setup', {
    body: JSON.stringify(request),
    headers: { 'Content-Type': 'application/json' },
    method: 'PUT',
  });
  const profile = await parseProfileResponse(response);
  if (!profile.initialSetupCompleted) throw new ProfileUpdateError();
  return profile;
}

export async function skipInitialSetup(): Promise<ProfileResponse> {
  const response = await authenticatedFetch('/api/v1/users/me/profile/initial-setup/skip', {
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
  const profile = await parseProfileResponse(response);
  if (!profile.initialSetupCompleted) throw new ProfileUpdateError();
  return profile;
}

export async function setPredefinedAvatar(avatarKey: string): Promise<ProfileResponse> {
  const response = await authenticatedFetch('/api/v1/users/me/profile/avatar/predefined', {
    body: JSON.stringify({ avatarKey }),
    headers: { 'Content-Type': 'application/json' },
    method: 'PUT',
  });
  return parseProfileResponse(response);
}

export async function getHomeProfileData(signal?: AbortSignal): Promise<HomeProfileData> {
  const profileRequest = getProfile(signal);
  // Falha do catálogo não impede o uso dos demais dados reais do perfil.
  const avatarsRequest = loadAvatars(signal).catch(() => []);
  return { profile: await profileRequest, avatars: await avatarsRequest };
}
