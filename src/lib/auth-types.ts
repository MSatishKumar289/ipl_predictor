export type UserRole = "user" | "admin";
export type UserAccessStatus = "active" | "pending_approval";

export type UserProfile = {
  displayName: string;
  email: string;
  phoneNumber?: string | null;
  loginMethod?: "phone" | "email";
  referralId?: string | null;
  referredByUserId?: string | null;
  referredByDisplayName?: string | null;
  hasSeenReferralMessage?: boolean;
  accessStatus?: UserAccessStatus;
  role: UserRole;
  balance: number;
  points: number;
  wins: number;
  losses: number;
  totalPredictions: number;
};

export type UserProfileRecord = UserProfile & {
  uid: string;
};
