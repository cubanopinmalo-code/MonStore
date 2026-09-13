/**
 * Métodos de acceso (vinculación de cuenta) por juego.
 * Cada juego admite plataformas de inicio de sesión distintas.
 */

const DEFAULT_ACCESS = [
  "Google",
  "Facebook",
  "Apple ID",
  "Correo y contraseña",
] as const;

type Rule = { match: RegExp; access: string[] };

const RULES: Rule[] = [
  {
    // Garena Free Fire
    match: /free\s*fire/i,
    access: ["Facebook", "Google", "VK", "Apple ID", "Huawei ID", "X (Twitter)", "Cuenta Garena"],
  },
  {
    // Moonton
    match: /mobile\s*legends|mlbb/i,
    access: ["Cuenta Moonton", "Facebook", "Google", "VK", "TikTok", "Apple ID"],
  },
  {
    match: /delta\s*force/i,
    access: ["Cuenta Level Infinite", "Google", "Facebook", "Apple ID", "X (Twitter)", "Steam (PC)"],
  },
  {
    match: /fc\s*mobile|fifa|ea\s*sports/i,
    access: ["Cuenta EA", "Google", "Facebook", "Apple ID"],
  },
  {
    // Dream League Soccer
    match: /dls|dream\s*league/i,
    access: ["Google", "Facebook", "Apple ID", "Correo y contraseña"],
  },
  {
    // Neo Monsters
    match: /neo\s*monsters?/i,
    access: ["Google", "Facebook", "Apple ID", "Correo y contraseña"],
  },
  {
    match: /blood\s*strike/i,
    access: ["Cuenta NetEase", "Google", "Facebook", "Apple ID", "X (Twitter)"],
  },
  {
    match: /arena\s*breakout/i,
    access: ["Cuenta Level Infinite", "Google", "Facebook", "Apple ID", "X (Twitter)", "VK"],
  },
  {
    match: /pubg|bgmi/i,
    access: ["Facebook", "Google", "Apple ID", "X (Twitter)", "Cuenta Level Infinite", "Steam (PC)"],
  },
  {
    match: /call\s*of\s*duty|cod\s*mobile|warzone/i,
    access: ["Cuenta Activision", "Facebook", "Google", "Apple ID", "Battle.net", "Steam (PC)"],
  },
  {
    match: /genshin|honkai|zenless|hoyo/i,
    access: ["Cuenta HoYoverse", "Google", "Facebook", "Apple ID", "X (Twitter)"],
  },
  {
    match: /roblox/i,
    access: ["Usuario Roblox", "Google", "Apple ID", "Xbox"],
  },
  {
    match: /clash|brawl|supercell/i,
    access: ["Supercell ID", "Google", "Apple ID"],
  },
  {
    match: /fortnite|rocket\s*league|epic/i,
    access: ["Cuenta Epic Games", "Google", "Facebook", "Apple ID", "Steam (PC)", "PlayStation Network", "Xbox"],
  },
  {
    match: /valorant|league\s*of\s*legends|wild\s*rift|riot|teamfight/i,
    access: ["Cuenta Riot", "Google", "Facebook", "Apple ID", "Xbox"],
  },
  {
    match: /steam|counter[-\s]?strike|dota/i,
    access: ["Steam", "Correo y contraseña"],
  },
  {
    match: /minecraft|xbox/i,
    access: ["Cuenta Microsoft", "Xbox", "Correo y contraseña"],
  },
  {
    match: /honor\s*of\s*kings|undawn|tower\s*of\s*fantasy|level\s*infinite/i,
    access: ["Cuenta Level Infinite", "Google", "Facebook", "Apple ID", "X (Twitter)"],
  },
];

/** Devuelve los métodos de acceso disponibles para el juego indicado. */
export function getAccessMethods(gameName: string | undefined | null): string[] {
  if (!gameName) return [...DEFAULT_ACCESS];
  const rule = RULES.find((item) => item.match.test(gameName));
  return rule ? [...rule.access] : [...DEFAULT_ACCESS];
}
