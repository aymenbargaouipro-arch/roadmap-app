"use client";

import { useRouter } from "next/navigation";
import { RoadmapCreateModal } from "@/components/roadmap-create-modal";

export default function NewRoadmapPage() {
  const router = useRouter();
  return <RoadmapCreateModal onClose={() => router.back()} />;
}
