// AI story generation — combines all active goals of a group's members into ONE story.
// Uses the OpenAI Responses API via the `openai` SDK. Credentials are injected at server
// start with api_credentials=["llm-api:website"]; in deployed prod they may be absent (503).
import OpenAI from "openai";
import type { Student, Goal, Beat, StopPoint } from "../shared/schema";

export interface GeneratedStory {
  title: string;
  est_minutes: number;
  beats: Beat[];
  stop_points: StopPoint[];
  target_goal_ids: number[];
}

export class GenerationUnavailableError extends Error {}

function gradeBand(students: Student[]): string {
  const grades = students
    .map((s) => parseInt((s.grade || "").replace(/\D/g, ""), 10))
    .filter((n) => !isNaN(n));
  if (!grades.length) return "elementary (grades K-5)";
  const lo = Math.min(...grades);
  const hi = Math.max(...grades);
  return `grades ${lo}-${hi}`;
}

export async function generateStory(
  members: { student: Student; goals: Goal[] }[],
  opts: { theme?: string } = {},
): Promise<GeneratedStory> {
  const withGoals = members.filter((m) => m.goals.length > 0);
  if (withGoals.length === 0) {
    throw new Error("No active goals found for this group's students.");
  }

  const students = withGoals.map((m) => m.student);
  const band = gradeBand(students);
  const allGoalIds: number[] = [];

  const goalLines = withGoals
    .map((m) => {
      const lines = m.goals
        .map((g) => {
          allGoalIds.push(g.id);
          return `    - goalId ${g.id} [${g.goal_type}] "${g.label}": ${g.text} (target: ${g.target_criteria})`;
        })
        .join("\n");
      return `  Student "${m.student.name}" (studentId ${m.student.id}, grade ${m.student.grade ?? "?"}):\n${lines}`;
    })
    .join("\n");

  const theme = opts.theme?.trim()
    ? `The story theme/setting should be: ${opts.theme.trim()}.`
    : `Pick an engaging, age-appropriate adventure theme.`;

  const prompt = `You are an expert speech-language pathologist and children's story author.
Write ONE cohesive interactive therapy story for a small group, suitable for ${band}.
The story is read aloud scene-by-scene. After certain scenes, the clinician pauses at a
"stop-point" to work on ONE specific student's IEP goal using the story content.

THE STUDENTS AND THEIR ACTIVE GOALS:
${goalLines}

${theme}

REQUIREMENTS:
- 5 to 7 ordered "beats" (scenes). Each beat is 2-4 sentences of engaging narrative that flows into the next.
- FERPA / privacy: the story's CHARACTERS must be fictional and must NOT use any real student's name above. Use invented character names.
- Create at least ONE stop-point per goalId listed (more is fine for goals that need extra practice). Distribute stop-points across the beats; multiple stop-points may follow the same beat.
- Each stop-point MUST reference concrete words, phrases, or events from the beat it follows (afterBeatId), so the practice is grounded in what was just read.
- Tailor each stop-point to its goal type:
    * vocab/context clues: ask the student to infer a word's meaning using sentence context.
    * artic_s / artic_th / articulation: give a sentence to read aloud (or have them generate one) loaded with the target sound; targetResponse notes which words to score.
    * main_idea: read a complex/embedded sentence, ask for the main idea in simple words.
    * restate_active: read a passive-voice sentence, ask them to restate in active voice (who did what).
    * figurative: point to a simile/metaphor/hyperbole in the text and ask what it really means.
- responseType is "open" for most; use "choice" with a "choices" array (3 options) where a multiple-choice check fits (e.g. figurative language).
- Each stop-point includes: question (to the student), targetResponse (what a correct answer looks like, for the clinician), teachingNote (a quick cue/scaffold if the student is stuck).

Return ONLY valid JSON (no markdown), with this exact shape:
{
  "title": "string",
  "est_minutes": 15,
  "beats": [{"id":"b1","text":"..."}, {"id":"b2","text":"..."}],
  "stop_points": [
    {"id":"s1","afterBeatId":"b1","studentId":<number>,"goalId":<number>,"goalType":"<type>","question":"...","targetResponse":"...","teachingNote":"...","responseType":"open"},
    {"id":"s2","afterBeatId":"b2","studentId":<number>,"goalId":<number>,"goalType":"figurative","question":"...","targetResponse":"...","teachingNote":"...","responseType":"choice","choices":["...","...","..."]}
  ]
}`;

  let client: OpenAI;
  try {
    client = new OpenAI();
  } catch {
    throw new GenerationUnavailableError(
      "Story generation runs in the authoring environment and is not available on the live site.",
    );
  }

  let raw: string;
  try {
    const response = await client.responses.create({
      model: "gpt_5_1",
      input: prompt,
    } as any);
    raw = (response as any).output_text ?? "";
    if (!raw) {
      // fallback: dig into output array
      const out = (response as any).output || [];
      raw =
        out
          .flatMap((o: any) => o.content || [])
          .map((c: any) => c.text || "")
          .join("") || "";
    }
  } catch (e: any) {
    const msg = String(e?.message || e);
    if (/auth|api key|credential|401|403/i.test(msg)) {
      throw new GenerationUnavailableError(
        "Story generation runs in the authoring environment and is not available on the live site.",
      );
    }
    throw e;
  }

  const json = extractJson(raw);
  const parsed = JSON.parse(json) as GeneratedStory;

  // Normalize + validate
  parsed.est_minutes = parsed.est_minutes || 15;
  parsed.beats = (parsed.beats || []).map((b, i) => ({
    id: b.id || `b${i + 1}`,
    text: b.text,
  }));
  const beatIds = new Set(parsed.beats.map((b) => b.id));
  parsed.stop_points = (parsed.stop_points || []).map((s, i) => ({
    ...s,
    id: s.id || `s${i + 1}`,
    afterBeatId: beatIds.has(s.afterBeatId) ? s.afterBeatId : parsed.beats[0]?.id,
    responseType: s.responseType === "choice" ? "choice" : "open",
  }));
  parsed.target_goal_ids = Array.from(
    new Set(parsed.stop_points.map((s) => s.goalId).filter(Boolean)),
  );
  if (parsed.target_goal_ids.length === 0) parsed.target_goal_ids = allGoalIds;
  return parsed;
}

function extractJson(s: string): string {
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) return s.slice(start, end + 1);
  return s.trim();
}
