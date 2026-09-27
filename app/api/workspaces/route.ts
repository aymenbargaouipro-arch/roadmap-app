import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseJsonBody, requiredText } from "@/lib/validation";
import {
  ALREADY_IN_WORKSPACE_MESSAGE,
  WORKSPACE_CREATION_CLOSED_MESSAGE,
  checkWorkspaceCreation,
  lockInstance,
} from "@/lib/instance-access";

const createWorkspaceSchema = z.object({
  name: requiredText(100, "Nom requis."),
});

class WorkspaceCreationRefused extends Error {
  readonly reason: "already_member" | "closed";
  constructor(reason: "already_member" | "closed") {
    super(reason);
    this.reason = reason;
  }
}

// Creation d'espace, instance privee (audit M1) : seulement pour un compte sans espace, et
// seulement si l'instance n'en contient encore aucun. Son createur en devient l'admin.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  const userId = session.user.id;

  const parsed = await parseJsonBody(req, createWorkspaceSchema);
  if (!parsed.ok) return parsed.response;
  const name = parsed.data.name;

  try {
    const workspace = await prisma.$transaction(async (tx) => {
      await lockInstance(tx);

      const check = await checkWorkspaceCreation(tx, userId);
      if (!check.allowed) throw new WorkspaceCreationRefused(check.reason);

      return tx.workspace.create({
        data: {
          name,
          memberships: {
            create: { userId, role: "ADMIN" },
          },
        },
      });
    });

    return NextResponse.json(workspace);
  } catch (err) {
    if (err instanceof WorkspaceCreationRefused) {
      return err.reason === "already_member"
        ? NextResponse.json({ error: ALREADY_IN_WORKSPACE_MESSAGE }, { status: 409 })
        : NextResponse.json({ error: WORKSPACE_CREATION_CLOSED_MESSAGE }, { status: 403 });
    }
    throw err;
  }
}
