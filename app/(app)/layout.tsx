import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar
        workspaceName={membership?.workspace.name ?? "Aucun espace"}
        isAdmin={membership?.role === "ADMIN"}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar userName={session.user.name ?? session.user.email ?? ""} />
        <main className="min-w-0 flex-1 overflow-x-hidden p-8">{children}</main>
      </div>
    </div>
  );
}
