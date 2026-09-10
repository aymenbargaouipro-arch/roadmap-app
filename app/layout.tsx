import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Police Inter auto-hebergee (fichier variable woff2) au lieu de next/font/google, qui
// necessite de joindre Google Fonts au demarrage. Sur un reseau d'entreprise ou ce trafic
// est bloque (voir le souci de proxy PAC rencontre avec Jira), le telechargement echouait
// et Next basculait silencieusement sur une police de secours.
const inter = localFont({
  src: "./fonts/InterVariable.woff2",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Roadmaps",
  description: "Pilotage de roadmaps multi-équipes",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
