import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseJsonBody, requiredText } from "@/lib/validation";

const createWorkspaceSchema = z.object({
  name: requiredText(100, "Nom requis."),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const parsed = await parseJsonBody(req, createWorkspaceSchema);
  if (!parsed.ok) return parsed.response;

  const workspace = await prisma.workspace.create({
    data: {
      name: parsed.data.name,
      memberships: {
        create: { userId: session.user.id, role: "ADMIN" },
      },
    },
  });

  return NextResponse.json(workspace);
}
