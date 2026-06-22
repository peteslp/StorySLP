import { apiRequest } from "@/lib/queryClient";

// Friendly labels for goal_type codes
const GOAL_TYPE_LABELS: Record<string, string> = {
  vocab: "Vocabulary / context clues",
  artic_s: "Articulation /s/",
  artic_th: "Articulation /th/",
  main_idea: "Main idea",
  restate_active: "Restate (active voice)",
  figurative: "Figurative language",
};

export function goalTypeLabel(goalType: string): string {
  return GOAL_TYPE_LABELS[goalType] ?? goalType;
}

export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function dayName(day: number | null | undefined): string | null {
  if (day === null || day === undefined) return null;
  if (day < 0 || day > 6) return null;
  return DAY_NAMES[day];
}

// Preset identity colors used when creating students
export const PRESET_COLORS = [
  "#0E9594", // teal
  "#F2784B", // coral
  "#7C6AED", // violet
  "#3B82F6", // blue
  "#16A34A", // green
  "#EAB308", // amber
  "#EC4899", // pink
  "#0EA5E9", // sky
  "#8B5CF6", // purple
  "#EF4444", // red
];

// Derive readable text color (black/white) for a given hex background.
export function contrastText(hex: string): string {
  const c = hex.replace("#", "");
  if (c.length < 6) return "#fff";
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#1a1a1a" : "#ffffff";
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// Generic JSON fetch helper that routes through apiRequest (never raw fetch).
export async function getJSON<T>(url: string): Promise<T> {
  const res = await apiRequest("GET", url);
  return (await res.json()) as T;
}
