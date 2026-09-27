import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// "Se deconnecter de tous les appareils" (audit M1-c) : augmente la version de session du
// compte. Tous les jetons emis avant, y compris celui de la requete, sont refuses des leur
// prochaine utilisation.
export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  await prisma.user.update({
    where: { id: session.user.id },
    data: { sessionVersion: { increment: 1 } },
  });

  return NextResponse.json({ ok: true });
}
