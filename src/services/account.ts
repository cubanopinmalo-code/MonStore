import { mockNotifications, mockProfile, mockReferrals, mockUsers } from "@/data/mock/account";
import type { Notification, Profile, Referral } from "@/types";

export function getProfile(): Promise<Profile> {
  return Promise.resolve(mockProfile);
}

export function getUsers(): Promise<Profile[]> {
  return Promise.resolve(mockUsers);
}

export function getNotifications(): Promise<Notification[]> {
  return Promise.resolve(mockNotifications);
}

export function getReferrals(): Promise<Referral[]> {
  return Promise.resolve(mockReferrals);
}
