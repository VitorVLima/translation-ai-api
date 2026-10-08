export type EnglishLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export type LearningGoal = 'GENERAL' | 'CONVERSATION' | 'WORK' | 'TRAVEL' | 'STUDY';

export type AvatarType = 'PREDEFINED' | 'CUSTOM';

export type OnboardingStatus = 'PENDING' | 'DISMISSED' | 'COMPLETED';

export type ProfileResponse = {
  preferredName: string | null;
  birthDate: string | null;
  age: number | null;
  englishLevel: EnglishLevel | null;
  learningGoal: LearningGoal | null;
  avatarType: AvatarType;
  avatarKey: string | null;
  onboardingCompleted: boolean;
  onboardingStatus: OnboardingStatus;
  initialSetupCompleted: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AvatarResponse = {
  key: string;
  displayName: string;
  imageUrl: string;
};
