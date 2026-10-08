export type LoginRequest = {
  email: string;
  password: string;
};

export type RegisterRequest = {
  email: string;
  password: string;
};

export type VerifyEmailRequest = {
  email: string;
  code: string;
};

export type ResendEmailVerificationRequest = {
  email: string;
};

export type ForgotPasswordRequest = {
  email: string;
};

export type ResetPasswordRequest = {
  email: string;
  code: string;
  newPassword: string;
};

export type ValidatePasswordResetCodeRequest = {
  email: string;
  code: string;
};

export type GoogleLoginRequest = {
  credential: string;
  nonce: string;
};

export type UserResponse = {
  id: string;
  email: string;
  username: string | null;
  createdAt: string;
  role: 'USER' | 'ADMIN' | 'SUPER_ADMIN';
};

export type LoginResponse = {
  user: UserResponse;
  accessToken: string;
  refreshToken: string;
};

export type RefreshRequest = {
  refreshToken: string;
};

export type TokenPairResponse = {
  accessToken: string;
  refreshToken: string;
};
