import { NextResponse } from "next/server";
import { z } from "zod";

// Regles de validation communes aux routes API (audit L5).
// Objectif : toute donnee invalide recue par une route produit une erreur 400 lisible, jamais
// une erreur 500 (exception Prisma, date invalide, type inattendu...).

// --- Lecture du corps de requete -------------------------------------------------------------

type BodyResult<T> = { ok: true; data: T } | { ok: false; response: NextResponse };

function badRequest(message: string): { ok: false; response: NextResponse } {
  return { ok: false, response: NextResponse.json({ error: message }, { status: 400 }) };
}

/** Lit le JSON de la requete et le valide avec un schema zod. */
export async function parseJsonBody<S extends z.ZodTypeAny>(req: Request, schema: S): Promise<BodyResult<z.infer<S>>> {
  const raw = await req.json().catch(() => undefined);
  if (raw === undefined) return badRequest("Corps de requête invalide.");
  const result = schema.safeParse(raw);
  if (!result.success) {
    // Premier message d'erreur du schema (tous ecrits en francais ci-dessous), sinon generique.
    const first = result.error.issues[0]?.message;
    return badRequest(first && !first.startsWith("Expected") && !first.startsWith("Required") ? first : "Données invalides.");
  }
  return { ok: true, data: result.data };
}

// --- Dates -----------------------------------------------------------------------------------

const MIN_YEAR = 1970;
const MAX_YEAR = 2100;

/**
 * Convertit une valeur recue (texte ISO "2026-10-01", ou timestamp) en Date valide.
 * Renvoie null si la valeur est absente ou invalide, ou hors d'une plage raisonnable.
 */
export function parseDateInput(value: unknown): Date | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  if (typeof value === "string" && (value.length === 0 || value.length > 40)) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getUTCFullYear();
  if (year < MIN_YEAR || year > MAX_YEAR) return null;
  return date;
}

export const dateSchema = z
  .union([z.string(), z.number()])
  .transform((v, ctx) => {
    const d = parseDateInput(v);
    if (!d) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Date invalide." });
      return z.NEVER;
    }
    return d;
  });

/** Champ date obligatoire avec un message d'erreur choisi. */
export function requiredDate(message: string) {
  return z.unknown().transform((v, ctx) => {
    const d = parseDateInput(v);
    if (!d) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
      return z.NEVER;
    }
    return d;
  });
}

// --- Nombres et cases a cocher ---------------------------------------------------------------

/** Nombre (ou texte numerique) arrondi a l'entier, borne entre min et max. */
export function roundedInt(min: number, max: number, message: string) {
  return z.unknown().transform((v, ctx) => {
    const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
    if (!Number.isFinite(n) || Math.round(n) < min || Math.round(n) > max) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
      return z.NEVER;
    }
    return Math.round(n);
  });
}

/** Case a cocher : vrai uniquement pour true ou "true". Absent vaut faux. */
export const checkbox = z.unknown().transform((v, ctx) => {
  if (v === true || v === "true") return true;
  if (v === false || v === "false" || v === undefined || v === null) return false;
  ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Valeur de case à cocher invalide." });
  return z.NEVER;
});

// --- Enumerations ----------------------------------------------------------------------------

export const ITEM_STATUSES = ["TODO", "IN_PROGRESS", "BLOCKED", "DONE"] as const;
export type ItemStatusValue = (typeof ITEM_STATUSES)[number];

export function isItemStatus(value: unknown): value is ItemStatusValue {
  return typeof value === "string" && (ITEM_STATUSES as readonly string[]).includes(value);
}

// --- Texte -----------------------------------------------------------------------------------

/** Texte obligatoire, espaces retires, tronque a max caracteres. */
export function requiredText(max: number, message: string) {
  return z
    .string({ invalid_type_error: message, required_error: message })
    .transform((s) => s.trim().slice(0, max))
    .refine((s) => s.length > 0, { message });
}

/** Texte facultatif : null si absent ou vide, sinon tronque a max caracteres. */
export function optionalText(max: number) {
  return z
    .union([z.string(), z.null(), z.undefined()])
    .transform((s) => (typeof s === "string" && s.trim() ? s.trim().slice(0, max) : null));
}

// --- Images (logos de roadmap, audit L3) -----------------------------------------------------

/** Type reel d'une image d'apres ses premiers octets (PNG, JPEG ou WebP uniquement). */
export function detectImageType(buffer: Buffer): "image/png" | "image/jpeg" | "image/webp" | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

const LOGO_DATA_URL = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

export type LogoValidation = { ok: true; dataUrl: string } | { ok: false; error: string };

/**
 * Valide un logo recu sous forme de data URL. Refuse le SVG (qui peut contenir du code) et
 * tout contenu dont les octets ne correspondent pas au type annonce.
 */
export function validateLogoDataUrl(value: string, maxBytes: number): LogoValidation {
  const match = LOGO_DATA_URL.exec(value);
  if (!match) return { ok: false, error: "Format d'image non supporté. Utilise une image PNG, JPEG ou WebP." };

  const declaredType = `image/${match[1]}`;
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length === 0) return { ok: false, error: "Image vide ou illisible." };
  if (bytes.length > maxBytes) {
    return { ok: false, error: `Image trop lourde (${Math.round(maxBytes / 1024)} Ko max).` };
  }

  const realType = detectImageType(bytes);
  if (!realType || realType !== declaredType) {
    return { ok: false, error: "Le contenu du fichier ne correspond pas à une image PNG, JPEG ou WebP." };
  }

  return { ok: true, dataUrl: value };
}
