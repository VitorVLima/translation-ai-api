export type LoginRequest = {
  email: string;
  password: string;
};

export type UserResponse = {
  id: string;
  email: string;
  username: string;
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
