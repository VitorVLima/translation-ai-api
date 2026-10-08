import * as SecureStore from 'expo-secure-store';

const ONBOARDING_HIDDEN_KEY = 'englishai.onboarding.hidden';

export async function getOnboardingHidden(): Promise<boolean> {
  return (await SecureStore.getItemAsync(ONBOARDING_HIDDEN_KEY)) === 'true';
}

export function setOnboardingHidden(hidden: boolean): Promise<void> {
  return hidden
    ? SecureStore.setItemAsync(ONBOARDING_HIDDEN_KEY, 'true')
    : SecureStore.deleteItemAsync(ONBOARDING_HIDDEN_KEY);
}
