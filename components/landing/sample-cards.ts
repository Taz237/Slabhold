import type { ArtCard } from "@/components/card-slab-art";

/**
 * Sample slabs for the signed-out landing page. No real player, no real
 * collector, no photo: the slab art draws its own designed face.
 */
export const SAMPLE_SLABS: readonly ArtCard[] = [
  {
    playerName: "Your grail",
    year: 2024,
    yearLabel: "",
    setBrand: "Sample",
    grade: "10",
    gradeQualifier: "",
    certNumber: "",
    accent: "#7C3AED",
    conditionType: "graded",
    grader: "PSA",
  },
  {
    playerName: "Rookie auto",
    year: 2023,
    yearLabel: "",
    setBrand: "Sample",
    grade: "9.5",
    gradeQualifier: "",
    certNumber: "",
    accent: "#5B21B6",
    conditionType: "graded",
    grader: "BGS",
  },
  {
    playerName: "Short print",
    year: 2025,
    yearLabel: "",
    setBrand: "Sample",
    grade: "10",
    gradeQualifier: "",
    certNumber: "",
    accent: "#A78BFA",
    conditionType: "graded",
    grader: "SGC",
  },
];
