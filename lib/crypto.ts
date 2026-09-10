import crypto from "crypto";

// Cle derivee de JIRA_ENCRYPTION_KEY (variable d'environnement, a definir dans .env.local).
// Doit faire au moins 32 caracteres ; on la hash en SHA-256 pour obtenir exactement 32 octets,
// peu importe la longueur fournie par l'utilisateur.
function getKey(): Buffer {
  const secret = process.env.JIRA_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error(
      "JIRA_ENCRYPTION_KEY manquant dans .env.local. Ajoute une chaine aleatoire d'au moins 32 caracteres."
    );
  }
  return crypto.createHash("sha256").update(secret).digest();
}

// Format stocke en base : iv (12 octets) + authTag (16 octets) + ciphertext, le tout en base64.
export function encryptSecret(plainText: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

export function decryptSecret(stored: string): string {
  const key = getKey();
  const raw = Buffer.from(stored, "base64");
  const iv = raw.subarray(0, 12);
  const authTag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
