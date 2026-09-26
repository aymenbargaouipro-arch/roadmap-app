import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRiskMember } from "@/lib/access";

const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH"];
const RISK_STATUSES = ["OPEN", "MITIGATED", "CLOSED"];

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const access = await requireRiskMember(params.id, session.user.id);
  if (!access.ok) return access.response;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });

  const data: Record<string, unknown> = {};

  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim().slice(0, 500);
  if (body.impact) {
    if (!RISK_LEVELS.includes(body.impact)) return NextResponse.json({ error: "Impact invalide." }, { status: 400 });
    data.impact = body.impact;
  }
  if (body.probability) {
    if (!RISK_LEVELS.includes(body.probability)) {
      return NextResponse.json({ error: "Probabilité invalide." }, { status: 400 });
    }
    data.probability = body.probability;
  }
  if (body.status) {
    if (!RISK_STATUSES.includes(body.status)) return NextResponse.json({ error: "Statut invalide." }, { status: 400 });
    data.status = body.status;
  }

  const risk = await prisma.risk.update({ where: { id: params.id }, data });
  return NextResponse.json(risk);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const access = await requireRiskMember(params.id, session.user.id);
  if (!access.ok) return access.response;

  await prisma.risk.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
