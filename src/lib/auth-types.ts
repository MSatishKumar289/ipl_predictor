export type UserRole = "user" | "admin";

export type UserProfile = {
  displayName: string;
  email: string;
  phoneNumber?: string | null;
  role: UserRole;
  balance: number;
  points: number;
  wins: number;
  losses: number;
  totalPredictions: number;
};
