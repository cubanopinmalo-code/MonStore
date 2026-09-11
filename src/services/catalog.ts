import { mockGames } from "@/data/mock/games";
import { mockProducts } from "@/data/mock/products";
import type { Game, Product } from "@/types";

const delay = <T>(value: T, ms = 220): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms));

export function getGames(): Promise<Game[]> {
  return delay(mockGames);
}

export function getGameBySlug(slug: string): Promise<Game | null> {
  return delay(mockGames.find((game) => game.slug === slug) ?? null);
}

export function getProducts(): Promise<Product[]> {
  return delay(mockProducts);
}

export function getProductsByGame(gameId: string): Promise<Product[]> {
  return delay(mockProducts.filter((product) => product.game_id === gameId));
}

export function getProductById(productId: string): Promise<Product | null> {
  return delay(mockProducts.find((product) => product.id === productId) ?? null);
}
