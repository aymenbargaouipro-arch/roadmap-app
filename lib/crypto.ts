import crypto from "crypto";

// Chiffrement des secrets stockes en base (aujourd'hui : le token API Jira de chaque
// workspace). AES-256-GCM, renforce suite a l'audit (L2) :
// - la cle AES est derivee de JIRA_ENCRYPTION_KEY par HKDF (et non plus un simple SHA-256),
//   avec un contexte propre a cet usage ;
// - le chiffre est lie a son workspace (donnees associees, "AAD") : un token recopie sur la
//   ligne d'un autre workspace ne se dechiffre pas ;
// - chaque valeur porte un numero de version ("v2:..."), ce qui permet de faire evoluer le
//   format ou de changer de cle sans casser les valeurs existantes.
//
// Rotation de la cle : mettre la nouvelle valeur dans JIRA_ENCRYPTION_KEY et l'ancienne dans
// JIRA_ENCRYPTION_KEY_PREVIOUS. Les tokens sont dechiffres avec l'ancienne cle puis
// rechiffres avec la nouvelle a leur prochain usage (voir getWorkspaceJiraCredentials). Une
// fois tous les workspaces passes, JIRA_ENCRYPTION_KEY_PREVIOUS peut etre retiree.
//
// Les valeurs de l'ancien format (sans prefixe) restent lisibles : elles sont converties au
// nouveau format automatiquement lors de leur prochaine utilisation.

const MIN_SECRET_LENGTH = 32;
const CURRENT_VERSION = "v2";
const HKDF_SALT = "apex-secret-storage";
const HKDF_INFO = "aes-256-gcm:v2";

function readSecret(envName: string, required: boolean): string | null {
  const secret = process.env[envName];
  if (!secret) {
    if (required) {
      throw new Error(`${envName} manquant dans .env. Ajoute une chaine aleatoire d'au moins ${MIN_SECRET_LENGTH} caracteres.`);
    }
    return null;
  }
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`${envName} trop court : ${MIN_SECRET_LENGTH} caracteres minimum.`);
  }
  return secret;
}

function deriveKeyV2(secret: string): Buffer {
  return Buffer.from(crypto.hkdfSync("sha256", secret, HKDF_SALT, HKDF_INFO, 32));
}

// Ancien format (avant l'audit) : SHA-256 direct du secret, sans donnees associees.
function deriveKeyV1(secret: string): Buffer {
  return crypto.createHash("sha256").update(secret).digest();
}

/** Chiffre un secret pour un contexte donne (l'id du workspace proprietaire). */
export function encryptSecret(plainText: string, context: string): string {
  const key = deriveKeyV2(readSecret("JIRA_ENCRYPTION_KEY", true)!);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${CURRENT_VERSION}:${Buffer.concat([iv, authTag, ciphertext]).toString("base64")}`;
}

function decryptWith(key: Buffer, payloadBase64: string, aad: string | null): string {
  const raw = Buffer.from(payloadBase64, "base64");
  if (raw.length < 29) throw new Error("Valeur chiffree tronquee.");
  const iv = raw.subarray(0, 12);
  const authTag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  if (aad !== null) decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export type DecryptResult = {
  plainText: string;
  // Vrai si la valeur n'est pas au format et avec la cle actuels : l'appelant peut la
  // rechiffrer (encryptSecret) et l'enregistrer pour terminer la migration.
  needsReEncryption: boolean;
};

/**
 * Dechiffre une valeur stockee. Essaie la cle actuelle puis, si elle est definie, la cle
 * precedente (rotation en cours). Leve une exception si aucune ne convient.
 */
export function decryptSecret(stored: string, context: string): DecryptResult {
  const secrets = [readSecret("JIRA_ENCRYPTION_KEY", true)!, readSecret("JIRA_ENCRYPTION_KEY_PREVIOUS", false)].filter(
    (s): s is string => Boolean(s)
  );

  const isV2 = stored.startsWith(`${CURRENT_VERSION}:`);
  const payload = isV2 ? stored.slice(CURRENT_VERSION.length + 1) : stored;

  let lastError: unknown = null;
  for (const [index, secret] of secrets.entries()) {
    try {
      const plainText = isV2
        ? decryptWith(deriveKeyV2(secret), payload, context)
        : decryptWith(deriveKeyV1(secret), payload, null);
      return { plainText, needsReEncryption: !isV2 || index > 0 };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error("Dechiffrement impossible.");
}
