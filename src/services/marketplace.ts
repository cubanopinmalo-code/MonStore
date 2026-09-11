import { mockGameAccounts } from "@/data/mock/marketplace";
import type { GameAccount } from "@/types";

const CURRENT_USER = "us_001";

export function getListings(): Promise<GameAccount[]> {
  return Promise.resolve(
    mockGameAccounts.filter((listing) => listing.status === "aprobada"),
  );
}

export function getAllListings(): Promise<GameAccount[]> {
  return Promise.resolve(mockGameAccounts);
}

export function getMyListings(): Promise<GameAccount[]> {
  return Promise.resolve(
    mockGameAccounts.filter((listing) => listing.seller_id === CURRENT_USER),
  );
}
