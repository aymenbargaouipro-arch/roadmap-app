export const ROADMAP_COLOR_PALETTE = [
  { name: "Teal", value: "#5EAAA8" },
  { name: "Bleu ardoise", value: "#6B8CAE" },
  { name: "Vert sauge", value: "#8FAE8B" },
  { name: "Rose poudré", value: "#C98B8B" },
  { name: "Ambre", value: "#C9A15A" },
  { name: "Lavande", value: "#9B8BC9" },
  { name: "Terracotta", value: "#C98B6B" },
  { name: "Bleu acier", value: "#7A9BAE" },
  { name: "Sable", value: "#C9B88B" },
  { name: "Mauve", value: "#AE8BA0" },
] as const;

export const DEFAULT_ROADMAP_COLOR = ROADMAP_COLOR_PALETTE[0].value;

export function isValidRoadmapColor(value: string): boolean {
  return ROADMAP_COLOR_PALETTE.some((c) => c.value.toLowerCase() === value.toLowerCase());
}

export const ROADMAP_EMOJI_OPTIONS = [
  "🚀", "🛡️", "⚡", "🎯", "🔥", "💎", "🌊", "🎨", "🧭", "🛰️",
  "📊", "🔧", "🌱", "⭐", "🏔️", "🔭", "🧩", "🪐", "🛠️", "📡",
];

// Taille max du fichier ORIGINAL avant encodage base64 (le base64 lui-meme est ~37% plus
// lourd, pris en compte cote validation serveur).
export const MAX_LOGO_BYTES = 500 * 1024;

// Ajoute un suffixe alpha hex a une couleur "#RRGGBB" pour un fond pastel transparent
// (ex: DEFAULT_ROADMAP_COLOR + alpha "26" = ~15% opacite). N'accepte que le format attendu
// produit par la palette ci-dessus.
export function withAlpha(hexColor: string, alphaHex: string): string {
  return `${hexColor}${alphaHex}`;
}
