import amazon from "@/assets/giftcards/amazon.jpg";
import apple from "@/assets/giftcards/apple.jpg";
import googleplay from "@/assets/giftcards/googleplay.jpg";
import netflix from "@/assets/giftcards/netflix.jpg";
import playstation from "@/assets/giftcards/playstation.jpg";
import xbox from "@/assets/giftcards/xbox.jpg";
import steam from "@/assets/giftcards/steam.jpg";
import razer from "@/assets/giftcards/razer.jpg";
import roblox from "@/assets/giftcards/roblox.jpg";
import valorant from "@/assets/giftcards/valorant.jpg";
import nintendo from "@/assets/giftcards/nintendo.jpg";
import twitch from "@/assets/giftcards/twitch.jpg";
import telegram from "@/assets/giftcards/telegram.jpg";
import minecraft from "@/assets/giftcards/minecraft.jpg";
import mobile from "@/assets/giftcards/mobile.jpg";
import generic from "@/assets/giftcards/generic.jpg";

/** Palabras clave del nombre de la tarjeta y la imagen que le corresponde. */
const RULES: Array<[RegExp, string]> = [
  [/amazon/i, amazon],
  [/apple|itunes/i, apple],
  [/google\s*play/i, googleplay],
  [/netflix/i, netflix],
  [/\bpsn\b|playstation/i, playstation],
  [/xbox|game\s*pass/i, xbox],
  [/steam/i, steam],
  [/razer/i, razer],
  [/roblox/i, roblox],
  [/valorant|riot/i, valorant],
  [/nintendo|switch/i, nintendo],
  [/twitch/i, twitch],
  [/telegram/i, telegram],
  [/minecraft/i, minecraft],
  [/pubg|honor of kings|merge kingdoms|yalla|netease|noon|gamestop/i, mobile],
];

/** Imagen temática para una tarjeta de regalo según su nombre. */
export function giftCardImage(name: string): string {
  for (const [pattern, image] of RULES) {
    if (pattern.test(name)) return image;
  }
  return generic;
}

export const GIFT_CARD_CATEGORY = "Tarjetas y códigos";

/** Indica si un elemento del catálogo es una tarjeta de regalo o código. */
export function isGiftCard(item: { category?: string | null }): boolean {
  return /tarjeta|gift|código|codigo/i.test(item.category ?? "");
}
