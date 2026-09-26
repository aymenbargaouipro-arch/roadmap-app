import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRoadmapMember } from "@/lib/access";

const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;
type RiskLevel = (typeof RISK_LEVELS)[number];

function isRiskLevel(value: unknown): value is RiskLevel {
  return typeof value === "string" && (RISK_LEVELS as readonly string[]).includes(value);
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const access = await requireRoadmapMember(params.id, session.user.id);
  if (!access.ok) return access.response;

  const body = await req.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const impact: unknown = body?.impact;
  const probability: unknown = body?.probability;
  if (!title || !impact || !probability) {
    return NextResponse.json({ error: "Champs requis manquants." }, { status: 400 });
  }
  if (!isRiskLevel(impact) || !isRiskLevel(probability)) {
    return NextResponse.json({ error: "Impact ou probabilité invalide." }, { status: 400 });
  }

  const risk = await prisma.risk.create({
    data: {
      title: title.slice(0, 500),
      impact,
      probability,
      roadmapId: params.id,
    },
  });

  return NextResponse.json(risk);
}
