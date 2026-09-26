"use client";

import { RoadmapCreateModal } from "@/components/roadmap-create-modal";

export default function NewRoadmapPage() {
  // La modale gere elle-meme son ouverture et sa fermeture (elle n'accepte que "label").
  return <RoadmapCreateModal />;
}
