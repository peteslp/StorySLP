// Vercel serverless API for StorySLP — fully self-contained (no relative imports, no Express).
// Mirrors server/routes.ts + server/storage.ts. Talks to Supabase REST directly.
// Auth: single shared password (APP_PASSWORD) -> signed bearer token. All /api routes
// except /login, /me, /health require a valid token.
// Story generation uses OPENAI_API_KEY when present (live on the site); 503 otherwise.
import crypto from "node:crypto";

const SUPABASE_URL =
  process.env.SUPABASE_URL || "https://jdqdyomxtpzyqiisepfj.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  "sb_publishable_4Z0i1Njbxz1p9S5Tnk6z9w_6lHNQ0_g";

const REST = `${SUPABASE_URL}/rest/v1`;

function sbHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function sb<T>(path: string, init?: any): Promise<T> {
  const res = await fetch(`${REST}${path}`, {
    ...init,
    headers: { ...sbHeaders(), ...((init?.headers as Record<string, string>) || {}) },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase ${res.status} on ${path}: ${body}`);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

const repr = { Prefer: "return=representation" };

// ---------------- Auth ----------------
const APP_PASSWORD = process.env.APP_PASSWORD || "";
const AUTH_SECRET =
  process.env.AUTH_SECRET || process.env.APP_PASSWORD || "storyslp-dev-secret";

// Token = base64(payload).base64(hmac). Payload carries an issued-at so we can expire.
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

function signToken(): string {
  const payload = JSON.stringify({ iat: Date.now() });
  const p = Buffer.from(payload).toString("base64url");
  const sig = crypto.createHmac("sha256", AUTH_SECRET).update(p).digest("base64url");
  return `${p}.${sig}`;
}

function verifyToken(token: string | null | undefined): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [p, sig] = parts;
  const expected = crypto.createHmac("sha256", AUTH_SECRET).update(p).digest("base64url");
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  } catch {
    return false;
  }
  try {
    const payload = JSON.parse(Buffer.from(p, "base64url").toString());
    if (typeof payload.iat !== "number") return false;
    if (Date.now() - payload.iat > TOKEN_TTL_MS) return false;
    return true;
  } catch {
    return false;
  }
}

function bearer(req: any): string | null {
  const h = req.headers?.authorization || req.headers?.Authorization || "";
  const m = String(h).match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

const PALETTE = [
  "#0d9488", "#6366f1", "#d97706", "#db2777", "#0891b2",
  "#7c3aed", "#ea580c", "#16a34a", "#dc2626", "#2563eb",
];

function safeParse<T>(s: any, fallback: T): T {
  try {
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
}

function parseStoryRow(r: any) {
  return {
    id: r.id,
    group_id: r.group_id,
    title: r.title,
    status: r.status,
    est_minutes: r.est_minutes,
    beats: safeParse<any[]>(r.beats_json, []),
    stop_points: safeParse<any[]>(r.stop_points_json, []),
    target_goal_ids: safeParse<number[]>(r.target_goal_ids_json, []),
    audio_status: r.audio_status,
    audio: safeParse<any>(r.audio_json, {}),
    image_status: r.image_status,
    images: safeParse<any>(r.images_json, {}),
  };
}

const storage = {
  // ---------- Students ----------
  listStudents() {
    return sb<any[]>(`/students?order=id.asc`);
  },
  async createStudent(input: { name: string; grade?: string; color?: string }) {
    const groups = await sb<any[]>(`/groups?order=id.asc&limit=1`);
    const homeGroup = groups[0]?.id ?? null;
    const existing = await sb<any[]>(`/students?select=color`);
    const used = new Set(existing.map((s) => s.color));
    const color =
      input.color || PALETTE.find((c) => !used.has(c)) || PALETTE[existing.length % PALETTE.length];
    const rows = await sb<any[]>(`/students`, {
      method: "POST",
      headers: repr,
      body: JSON.stringify({
        name: input.name,
        grade: input.grade ?? null,
        color,
        group_id: homeGroup ?? 0,
      }),
    });
    const student = rows[0];
    if (homeGroup) await storage.addMember(homeGroup, student.id).catch(() => {});
    return student;
  },
  async updateStudent(id: number, input: any) {
    const rows = await sb<any[]>(`/students?id=eq.${id}`, {
      method: "PATCH",
      headers: repr,
      body: JSON.stringify(input),
    });
    return rows[0];
  },
  async deleteStudent(id: number) {
    await sb<null>(`/group_members?student_id=eq.${id}`, { method: "DELETE" }).catch(() => {});
    await sb<null>(`/goal_logs?student_id=eq.${id}`, { method: "DELETE" }).catch(() => {});
    await sb<null>(`/goals?student_id=eq.${id}`, { method: "DELETE" }).catch(() => {});
    await sb<null>(`/students?id=eq.${id}`, { method: "DELETE" });
  },

  // ---------- Goals ----------
  listGoals(studentId: number) {
    return sb<any[]>(`/goals?student_id=eq.${studentId}&order=id.asc`);
  },
  async createGoal(input: any) {
    const rows = await sb<any[]>(`/goals`, {
      method: "POST",
      headers: repr,
      body: JSON.stringify({
        student_id: input.student_id,
        label: input.label,
        text: input.text,
        goal_type: input.goal_type,
        target_criteria: input.target_criteria,
        active: input.active ?? true,
      }),
    });
    return rows[0];
  },
  async updateGoal(id: number, input: any) {
    const rows = await sb<any[]>(`/goals?id=eq.${id}`, {
      method: "PATCH",
      headers: repr,
      body: JSON.stringify(input),
    });
    return rows[0];
  },
  async deleteGoal(id: number) {
    await sb<null>(`/goal_logs?goal_id=eq.${id}`, { method: "DELETE" }).catch(() => {});
    await sb<null>(`/goals?id=eq.${id}`, { method: "DELETE" });
  },

  // ---------- Groups + membership ----------
  async listGroups() {
    const groups = await sb<any[]>(`/groups?order=id.asc`);
    const members = await sb<any[]>(`/group_members?select=group_id,student_id`);
    const students = await sb<any[]>(`/students?order=id.asc`);
    const sById = new Map(students.map((s) => [s.id, s]));
    return groups.map((g) => {
      const mem = members
        .filter((m) => m.group_id === g.id)
        .map((m) => sById.get(m.student_id))
        .filter(Boolean);
      return { ...g, members: mem, studentCount: mem.length };
    });
  },
  async createGroup(input: any) {
    const rows = await sb<any[]>(`/groups`, {
      method: "POST",
      headers: repr,
      body: JSON.stringify({
        name: input.name,
        schedule: input.schedule ?? null,
        day_of_week: input.day_of_week ?? null,
      }),
    });
    return rows[0];
  },
  async updateGroup(id: number, input: any) {
    const rows = await sb<any[]>(`/groups?id=eq.${id}`, {
      method: "PATCH",
      headers: repr,
      body: JSON.stringify(input),
    });
    return rows[0];
  },
  async deleteGroup(id: number) {
    await sb<null>(`/group_members?group_id=eq.${id}`, { method: "DELETE" }).catch(() => {});
    await sb<null>(`/groups?id=eq.${id}`, { method: "DELETE" });
  },
  async addMember(groupId: number, studentId: number) {
    await sb<null>(`/group_members`, {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates" },
      body: JSON.stringify({ group_id: groupId, student_id: studentId }),
    }).catch((e) => {
      if (!String(e).includes("409") && !String(e).includes("duplicate")) throw e;
    });
  },
  async removeMember(groupId: number, studentId: number) {
    await sb<null>(`/group_members?group_id=eq.${groupId}&student_id=eq.${studentId}`, {
      method: "DELETE",
    });
  },
  async moveStudent(studentId: number, toGroupId: number, fromGroupId?: number) {
    if (fromGroupId) await storage.removeMember(fromGroupId, studentId);
    await storage.addMember(toGroupId, studentId);
  },
  async groupsForStudent(studentId: number) {
    const rows = await sb<any[]>(`/group_members?student_id=eq.${studentId}&select=group_id`);
    return rows.map((r) => r.group_id);
  },

  // ---------- Stories ----------
  async listStories(groupId: number) {
    const rows = await sb<any[]>(`/stories?group_id=eq.${groupId}&order=id.desc`);
    return rows.map(parseStoryRow);
  },
  async listAllStories() {
    const rows = await sb<any[]>(`/stories?order=id.desc`);
    return rows.map(parseStoryRow);
  },
  async getStory(id: number) {
    const rows = await sb<any[]>(`/stories?id=eq.${id}`);
    return rows[0] ? parseStoryRow(rows[0]) : undefined;
  },
  async createStory(input: any) {
    const rows = await sb<any[]>(`/stories`, {
      method: "POST",
      headers: repr,
      body: JSON.stringify({
        group_id: input.group_id,
        title: input.title,
        status: input.status ?? "draft",
        est_minutes: input.est_minutes ?? 15,
        beats_json: JSON.stringify(input.beats ?? []),
        stop_points_json: JSON.stringify(input.stop_points ?? []),
        target_goal_ids_json: JSON.stringify(input.target_goal_ids ?? []),
        audio_status: "none",
        audio_json: "{}",
        image_status: "none",
        images_json: "{}",
      }),
    });
    return parseStoryRow(rows[0]);
  },
  async updateStory(id: number, input: any) {
    const patch: any = {};
    if (input.title !== undefined) patch.title = input.title;
    if (input.status !== undefined) patch.status = input.status;
    if (input.est_minutes !== undefined) patch.est_minutes = input.est_minutes;
    if (input.beats !== undefined) patch.beats_json = JSON.stringify(input.beats);
    if (input.stop_points !== undefined) patch.stop_points_json = JSON.stringify(input.stop_points);
    if (input.target_goal_ids !== undefined)
      patch.target_goal_ids_json = JSON.stringify(input.target_goal_ids);
    const rows = await sb<any[]>(`/stories?id=eq.${id}`, {
      method: "PATCH",
      headers: repr,
      body: JSON.stringify(patch),
    });
    return rows[0] ? parseStoryRow(rows[0]) : undefined;
  },
  async deleteStory(id: number) {
    await sb<null>(`/stories?id=eq.${id}`, { method: "DELETE" });
  },
  async updateStoryAudio(id: number, status: string, audio: any) {
    const rows = await sb<any[]>(`/stories?id=eq.${id}`, {
      method: "PATCH",
      headers: repr,
      body: JSON.stringify({ audio_status: status, audio_json: JSON.stringify(audio ?? {}) }),
    });
    return rows[0] ? parseStoryRow(rows[0]) : undefined;
  },
  async updateStoryImages(id: number, status: string, images: any) {
    const rows = await sb<any[]>(`/stories?id=eq.${id}`, {
      method: "PATCH",
      headers: repr,
      body: JSON.stringify({ image_status: status, images_json: JSON.stringify(images ?? {}) }),
    });
    return rows[0] ? parseStoryRow(rows[0]) : undefined;
  },

  // ---------- Sessions + logs ----------
  listSessions(groupId: number) {
    return sb<any[]>(`/sessions?group_id=eq.${groupId}&order=id.desc`);
  },
  listAllSessions() {
    return sb<any[]>(`/sessions?order=id.desc`);
  },
  async getSession(id: number) {
    const rows = await sb<any[]>(`/sessions?id=eq.${id}`);
    return rows[0];
  },
  async createSession(input: any) {
    const rows = await sb<any[]>(`/sessions`, {
      method: "POST",
      headers: repr,
      body: JSON.stringify({
        group_id: input.group_id,
        story_id: input.story_id,
        date: input.date,
        notes: input.notes ?? null,
      }),
    });
    return rows[0];
  },
  listLogs(sessionId: number) {
    return sb<any[]>(`/goal_logs?session_id=eq.${sessionId}&order=id.asc`);
  },
  async upsertLog(sessionId: number, input: any) {
    const filter = `/goal_logs?session_id=eq.${sessionId}&student_id=eq.${input.student_id}&goal_id=eq.${input.goal_id}`;
    const existing = await sb<any[]>(filter);
    const payload = {
      session_id: sessionId,
      student_id: input.student_id,
      goal_id: input.goal_id,
      trials: input.trials ?? 0,
      correct: input.correct ?? 0,
      prompted: input.prompted ?? 0,
      note: input.note ?? null,
    };
    if (existing.length > 0) {
      const rows = await sb<any[]>(filter, {
        method: "PATCH",
        headers: repr,
        body: JSON.stringify(payload),
      });
      return rows[0];
    }
    const rows = await sb<any[]>(`/goal_logs`, {
      method: "POST",
      headers: repr,
      body: JSON.stringify(payload),
    });
    return rows[0];
  },

  // ---------- Coverage ----------
  async coverage(groupId: number) {
    const groups = await storage.listGroups();
    const group = groups.find((g) => g.id === groupId);
    if (!group) return [];
    const memberIds = group.members.map((m: any) => m.id);
    if (memberIds.length === 0) return [];
    const inList = `(${memberIds.join(",")})`;
    const goals = await sb<any[]>(`/goals?student_id=in.${inList}&active=is.true&order=id.asc`);
    const studentsById = new Map(group.members.map((m: any) => [m.id, m]));
    const sessions = await sb<any[]>(`/sessions?group_id=eq.${groupId}`);
    const sessionIds = sessions.map((s) => s.id);
    let logs: any[] = [];
    if (sessionIds.length) {
      logs = await sb<any[]>(`/goal_logs?session_id=in.(${sessionIds.join(",")})`);
    }
    const sessionDate = new Map(sessions.map((s) => [s.id, s.date]));
    return goals.map((g) => {
      const gLogs = logs.filter((l) => l.goal_id === g.id);
      const total_trials = gLogs.reduce((a, l) => a + l.trials, 0);
      const total_correct = gLogs.reduce((a, l) => a + l.correct, 0);
      const dates = gLogs.map((l) => sessionDate.get(l.session_id)).filter(Boolean) as string[];
      const last = dates.sort().slice(-1)[0] ?? null;
      return {
        goal_id: g.id,
        student_id: g.student_id,
        student_name: (studentsById.get(g.student_id) as any)?.name ?? "?",
        label: g.label,
        goal_type: g.goal_type,
        target_criteria: g.target_criteria,
        total_trials,
        total_correct,
        accuracy: total_trials > 0 ? Math.round((total_correct / total_trials) * 100) : null,
        last_session_date: last,
      };
    });
  },
};

// ---------------- Story generation (OpenAI) ----------------
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o";
// High-quality narration. tts-1-hd = OpenAI's HD voice model. Voice overridable per request.
const OPENAI_TTS_MODEL = process.env.OPENAI_TTS_MODEL || "tts-1-hd";
const TTS_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];
const DEFAULT_TTS_VOICE = process.env.OPENAI_TTS_VOICE || "nova";
const AUDIO_BUCKET = "story-audio";

// Plain-text narration script from a story's beats (no stop-points; this is the read-aloud).
function storyNarrationText(story: any): string {
  const beats = Array.isArray(story?.beats) ? story.beats : [];
  const parts: string[] = [];
  if (story?.title) parts.push(String(story.title) + ".");
  for (const b of beats) {
    const t = (b?.text || "").trim();
    if (t) parts.push(t);
  }
  return parts.join("\n\n");
}

// Upload an MP3 buffer to the public Supabase Storage bucket; return its public URL.
async function uploadAudio(objectPath: string, mp3: Buffer): Promise<string> {
  const url = `${SUPABASE_URL}/storage/v1/object/${AUDIO_BUCKET}/${objectPath}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "audio/mpeg",
      "x-upsert": "true",
      "Cache-Control": "public, max-age=31536000",
    },
    body: mp3,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Storage upload ${res.status}: ${body}`);
  }
  return `${SUPABASE_URL}/storage/v1/object/public/${AUDIO_BUCKET}/${objectPath}`;
}

// Generate narration for a story: OpenAI TTS -> upload -> return audio meta.
async function synthesizeStoryAudio(
  story: any,
  opts: { voice?: string } = {},
): Promise<{ url: string; voice: string; model: string; chars: number; generated_at: string }> {
  const text = storyNarrationText(story);
  if (!text.trim()) throw new Error("This story has no narrative text to read.");
  const voice = TTS_VOICES.includes(String(opts.voice)) ? String(opts.voice) : DEFAULT_TTS_VOICE;
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_TTS_MODEL,
      voice,
      input: text,
      response_format: "mp3",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI TTS ${res.status}: ${body}`);
  }
  const arrayBuf = await res.arrayBuffer();
  const mp3 = Buffer.from(arrayBuf);
  const objectPath = `story-${story.id}-${voice}-${Date.now()}.mp3`;
  const publicUrl = await uploadAudio(objectPath, mp3);
  return {
    url: publicUrl,
    voice,
    model: OPENAI_TTS_MODEL,
    chars: text.length,
    generated_at: new Date().toISOString(),
  };
}

// ---------------- Comic strip (OpenAI images) ----------------
const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
const IMAGE_BUCKET = "story-images";
const COMIC_STYLE =
  "Classic American comic-book art style: bold black ink outlines, dynamic cel shading, " +
  "halftone dot shading, vivid saturated colors, dramatic lighting. Single comic panel, " +
  "no speech bubbles, no text, no captions, no lettering, no panel borders or gutters. " +
  "Wholesome, child-friendly, suitable for an elementary classroom.";

// Ask the model once for a compact, fixed visual description of the cast so panels stay consistent.
async function deriveCharacterSheet(story: any): Promise<string> {
  const beats = (Array.isArray(story?.beats) ? story.beats : [])
    .map((b: any) => (b?.text || "").trim())
    .filter(Boolean)
    .join("\n\n");
  const prompt = `Read this children's story and produce a CONCISE visual "character bible" so an artist can draw the same characters consistently in every panel.
For each recurring named character, give 1 line: name, age range, hair, skin tone, signature outfit/colors, and one distinguishing feature. Also give a 1-line description of the main setting.
Keep the WHOLE thing under 120 words. No preamble, just the lines.

STORY:
${beats}`;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
      max_tokens: 400,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI (char sheet) ${res.status}: ${body}`);
  }
  const data: any = await res.json();
  return (data?.choices?.[0]?.message?.content || "").trim();
}

// Generate one comic panel PNG (base64) for a beat, anchored to the character sheet.
async function generateComicPanel(
  beatText: string,
  charSheet: string,
  band: string,
): Promise<Buffer> {
  const prompt = `${COMIC_STYLE}

AUDIENCE: ${band}.

CONSISTENT CAST AND SETTING (draw these exactly the same way every time):
${charSheet}

DEPICT THIS SCENE as a single comic panel:
${beatText}`;
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_IMAGE_MODEL,
      prompt: prompt.slice(0, 3800),
      n: 1,
      size: "1024x1024",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI image ${res.status}: ${body}`);
  }
  const data: any = await res.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error("Image model returned no image data.");
  return Buffer.from(b64, "base64");
}

// Upload a PNG buffer to the public image bucket; return its public URL.
async function uploadImage(objectPath: string, png: Buffer): Promise<string> {
  const url = `${SUPABASE_URL}/storage/v1/object/${IMAGE_BUCKET}/${objectPath}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "image/png",
      "x-upsert": "true",
      "Cache-Control": "public, max-age=31536000",
    },
    body: png,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Image upload ${res.status}: ${body}`);
  }
  return `${SUPABASE_URL}/storage/v1/object/public/${IMAGE_BUCKET}/${objectPath}`;
}

function gradeBand(students: any[]): string {
  const grades = students
    .map((s) => parseInt(String(s.grade || "").replace(/\D/g, ""), 10))
    .filter((n) => !isNaN(n));
  if (!grades.length) return "elementary (grades K-5)";
  return `grades ${Math.min(...grades)}-${Math.max(...grades)}`;
}

function extractJson(s: string): string {
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) return s.slice(start, end + 1);
  return s.trim();
}

async function generateStory(
  members: { student: any; goals: any[] }[],
  opts: { theme?: string } = {},
): Promise<any> {
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

LENGTH TARGET — IMPORTANT:
- This story must fill a FULL ~30-minute therapy session of reading aloud plus stop-point discussion. Do NOT write a short story.
- Write 10 to 14 ordered "beats" (scenes). Each beat must be a SUBSTANTIAL paragraph of 5-8 sentences (~90-140 words) of rich, descriptive narrative — vivid setting, character dialogue, and rising action — that flows into the next beat.
- The total narrative across all beats should be roughly 1,000-1,500 words. Develop a real arc: setup, escalating challenges, a climax, and a resolution.

REQUIREMENTS:
- FERPA / privacy: the story's CHARACTERS must be fictional and must NOT use any real student's name above. Use invented character names.
- Create at LEAST TWO stop-points per goalId listed (more is fine), so each student gets repeated practice across the longer story. Distribute stop-points across the beats; multiple stop-points may follow the same beat.
- Each stop-point MUST reference concrete words, phrases, or events from the beat it follows (afterBeatId).
- Tailor each stop-point to its goal type:
    * vocab/context clues: ask the student to infer a word's meaning using sentence context.
    * artic_s / artic_th / articulation: give a sentence to read aloud loaded with the target sound; targetResponse notes which words to score.
    * main_idea: read a complex/embedded sentence, ask for the main idea in simple words.
    * restate_active: read a passive-voice sentence, ask them to restate in active voice (who did what).
    * figurative: point to a simile/metaphor/hyperbole in the text and ask what it really means.
- responseType is "open" for most; use "choice" with a "choices" array (3 options) where a multiple-choice check fits.
- Each stop-point includes: question (to the student), targetResponse (for the clinician), teachingNote (a quick scaffold).

Return ONLY valid JSON with this exact shape:
{
  "title": "string",
  "est_minutes": 30,
  "beats": [{"id":"b1","text":"..."}],
  "stop_points": [
    {"id":"s1","afterBeatId":"b1","studentId":0,"goalId":0,"goalType":"<type>","question":"...","targetResponse":"...","teachingNote":"...","responseType":"open"}
  ]
}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.8,
      max_tokens: 8000,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI ${res.status}: ${body}`);
  }
  const data: any = await res.json();
  const raw = data?.choices?.[0]?.message?.content || "";
  const parsed = JSON.parse(extractJson(raw));

  parsed.est_minutes = parsed.est_minutes || 30;
  parsed.beats = (parsed.beats || []).map((b: any, i: number) => ({
    id: b.id || `b${i + 1}`,
    text: b.text,
  }));
  const beatIds = new Set(parsed.beats.map((b: any) => b.id));
  parsed.stop_points = (parsed.stop_points || []).map((s: any, i: number) => ({
    ...s,
    id: s.id || `s${i + 1}`,
    afterBeatId: beatIds.has(s.afterBeatId) ? s.afterBeatId : parsed.beats[0]?.id,
    responseType: s.responseType === "choice" ? "choice" : "open",
  }));
  parsed.target_goal_ids = Array.from(
    new Set(parsed.stop_points.map((s: any) => s.goalId).filter(Boolean)),
  );
  if (parsed.target_goal_ids.length === 0) parsed.target_goal_ids = allGoalIds;
  return parsed;
}

async function generateForGroup(groupId: number, theme?: string) {
  const groups = await storage.listGroups();
  const group = groups.find((g) => g.id === groupId);
  if (!group) throw new Error("Group not found.");
  const members: { student: any; goals: any[] }[] = [];
  for (const s of group.members) {
    const goals = await storage.listGoals(s.id);
    members.push({ student: s, goals: goals.filter((g: any) => g.active) });
  }
  const gen = await generateStory(members, { theme });
  return storage.createStory({
    group_id: groupId,
    title: gen.title,
    status: "draft",
    est_minutes: gen.est_minutes,
    beats: gen.beats,
    stop_points: gen.stop_points,
    target_goal_ids: gen.target_goal_ids,
  });
}

function json(res: any, status: number, body: any) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

async function readBody(req: any): Promise<any> {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return await new Promise((resolve) => {
    let data = "";
    req.on("data", (c: any) => (data += c));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

export default async function handler(req: any, res: any) {
  const method = req.method || "GET";
  const url = new URL(req.url, "http://x");
  // strip leading /api
  const path = url.pathname.replace(/^\/api/, "") || "/";
  const seg = path.split("/").filter(Boolean); // e.g. ["students","1","goals"]

  try {
    // ---- health (public) ----
    if (path === "/health") return json(res, 200, { ok: true });

    // ---- login (public) ----
    if (path === "/login" && method === "POST") {
      const b = await readBody(req);
      if (!APP_PASSWORD) {
        return json(res, 500, { error: "Server is missing APP_PASSWORD configuration." });
      }
      if (typeof b.password === "string" && safeEqual(b.password, APP_PASSWORD)) {
        return json(res, 200, { token: signToken() });
      }
      return json(res, 401, { error: "Incorrect password." });
    }

    // ---- token check (public; used by the app on load) ----
    if (path === "/me" && method === "GET") {
      return verifyToken(bearer(req))
        ? json(res, 200, { ok: true })
        : json(res, 401, { error: "unauthorized" });
    }

    // ---- everything below requires a valid token ----
    if (!verifyToken(bearer(req))) {
      return json(res, 401, { error: "unauthorized" });
    }

    // ---- /students ... ----
    if (seg[0] === "students") {
      if (seg.length === 1 && method === "GET") return json(res, 200, await storage.listStudents());
      if (seg.length === 1 && method === "POST") {
        const b = await readBody(req);
        if (!b.name) return json(res, 400, { error: "name required" });
        return json(res, 200, await storage.createStudent(b));
      }
      const id = Number(seg[1]);
      if (seg.length === 2 && method === "PATCH") {
        const updated = await storage.updateStudent(id, await readBody(req));
        return updated ? json(res, 200, updated) : json(res, 404, { error: "not found" });
      }
      if (seg.length === 2 && method === "DELETE") {
        await storage.deleteStudent(id);
        return json(res, 200, { ok: true });
      }
      if (seg[2] === "goals" && method === "GET") return json(res, 200, await storage.listGoals(id));
      if (seg[2] === "groups" && method === "GET")
        return json(res, 200, await storage.groupsForStudent(id));
      if (seg[2] === "move" && method === "POST") {
        const b = await readBody(req);
        if (!b.to_group_id) return json(res, 400, { error: "to_group_id required" });
        await storage.moveStudent(id, Number(b.to_group_id), b.from_group_id ? Number(b.from_group_id) : undefined);
        return json(res, 200, { ok: true });
      }
    }

    // ---- /goals ... ----
    if (seg[0] === "goals") {
      if (seg.length === 1 && method === "POST") {
        const b = await readBody(req);
        if (!b.student_id || !b.label || !b.text || !b.goal_type || !b.target_criteria)
          return json(res, 400, { error: "student_id, label, text, goal_type, target_criteria required" });
        return json(res, 200, await storage.createGoal(b));
      }
      const id = Number(seg[1]);
      if (seg.length === 2 && method === "PATCH") {
        const updated = await storage.updateGoal(id, await readBody(req));
        return updated ? json(res, 200, updated) : json(res, 404, { error: "not found" });
      }
      if (seg.length === 2 && method === "DELETE") {
        await storage.deleteGoal(id);
        return json(res, 200, { ok: true });
      }
    }

    // ---- /groups ... ----
    if (seg[0] === "groups") {
      if (seg.length === 1 && method === "GET") return json(res, 200, await storage.listGroups());
      if (seg.length === 1 && method === "POST") {
        const b = await readBody(req);
        if (!b.name) return json(res, 400, { error: "name required" });
        return json(res, 200, await storage.createGroup(b));
      }
      const id = Number(seg[1]);
      if (seg.length === 2 && method === "PATCH") {
        const updated = await storage.updateGroup(id, await readBody(req));
        return updated ? json(res, 200, updated) : json(res, 404, { error: "not found" });
      }
      if (seg.length === 2 && method === "DELETE") {
        await storage.deleteGroup(id);
        return json(res, 200, { ok: true });
      }
      if (seg[2] === "members" && seg.length === 3 && method === "POST") {
        const b = await readBody(req);
        if (!b.student_id) return json(res, 400, { error: "student_id required" });
        await storage.addMember(id, Number(b.student_id));
        return json(res, 200, { ok: true });
      }
      if (seg[2] === "members" && seg.length === 4 && method === "DELETE") {
        await storage.removeMember(id, Number(seg[3]));
        return json(res, 200, { ok: true });
      }
      if (seg[2] === "stories" && method === "GET") return json(res, 200, await storage.listStories(id));
      if (seg[2] === "sessions" && method === "GET") return json(res, 200, await storage.listSessions(id));
      if (seg[2] === "coverage" && method === "GET") return json(res, 200, await storage.coverage(id));
    }

    // ---- /stories ... ----
    if (seg[0] === "stories") {
      if (seg.length === 1 && method === "GET") return json(res, 200, await storage.listAllStories());
      if (seg.length === 1 && method === "POST") {
        const b = await readBody(req);
        if (!b.group_id || !b.title) return json(res, 400, { error: "group_id and title required" });
        return json(res, 200, await storage.createStory(b));
      }
      if (seg[1] === "generate" && method === "POST") {
        if (!OPENAI_API_KEY) {
          return json(res, 503, {
            error: "Story generation isn't configured yet (missing OpenAI key).",
            unavailable: true,
          });
        }
        const b = await readBody(req);
        if (!b.group_id) return json(res, 400, { error: "group_id required" });
        try {
          const story = await generateForGroup(Number(b.group_id), b.theme);
          return json(res, 200, story);
        } catch (e: any) {
          const msg = String(e?.message || e);
          if (/No active goals/i.test(msg)) return json(res, 400, { error: msg });
          return json(res, 502, { error: "Generation failed.", message: msg });
        }
      }
      const id = Number(seg[1]);
      if (seg.length === 2 && method === "GET") {
        const story = await storage.getStory(id);
        return story ? json(res, 200, story) : json(res, 404, { error: "not found" });
      }
      if (seg.length === 2 && method === "PATCH") {
        const updated = await storage.updateStory(id, await readBody(req));
        return updated ? json(res, 200, updated) : json(res, 404, { error: "not found" });
      }
      if (seg.length === 2 && method === "DELETE") {
        await storage.deleteStory(id);
        return json(res, 200, { ok: true });
      }
      // POST /api/stories/:id/audio  -> generate high-quality narration
      if (seg[2] === "audio" && seg.length === 3 && method === "POST") {
        if (!OPENAI_API_KEY) {
          return json(res, 503, {
            error: "Narration isn't configured yet (missing OpenAI key).",
            unavailable: true,
          });
        }
        const story = await storage.getStory(id);
        if (!story) return json(res, 404, { error: "not found" });
        const b = await readBody(req);
        try {
          await storage.updateStoryAudio(id, "generating", { ...(story.audio || {}) });
          const audio = await synthesizeStoryAudio(story, { voice: b.voice });
          const updated = await storage.updateStoryAudio(id, "ready", audio);
          return json(res, 200, updated);
        } catch (e: any) {
          await storage.updateStoryAudio(id, "error", { error: String(e?.message || e) });
          return json(res, 502, { error: "Narration failed.", message: String(e?.message || e) });
        }
      }
      // DELETE /api/stories/:id/audio  -> clear narration
      if (seg[2] === "audio" && seg.length === 3 && method === "DELETE") {
        const updated = await storage.updateStoryAudio(id, "none", {});
        return updated ? json(res, 200, updated) : json(res, 404, { error: "not found" });
      }
      // POST /api/stories/:id/comic  -> generate comic panels in BATCHES.
      // Body: { from?: number, count?: number }. Panels are illustrated one per scene
      // and appended to images_json. Returns { done, next_from, total, panels } so the
      // client can loop until done (keeps each request well under the function timeout).
      if (seg[2] === "comic" && seg.length === 3 && method === "POST") {
        if (!OPENAI_API_KEY) {
          return json(res, 503, {
            error: "Comic generation isn't configured yet (missing OpenAI key).",
            unavailable: true,
          });
        }
        const story = await storage.getStory(id);
        if (!story) return json(res, 404, { error: "not found" });
        const beats: any[] = Array.isArray(story.beats) ? story.beats : [];
        if (!beats.length) return json(res, 400, { error: "This story has no scenes to illustrate." });
        const b = await readBody(req);
        const from = Math.max(0, Number(b.from) || 0);
        const batch = Math.min(Math.max(1, Number(b.count) || 3), 4);
        try {
          // grade band from the story's group students
          const groups = await storage.listGroups();
          const group = groups.find((g) => g.id === story.group_id);
          const band = gradeBand(group?.members || []);

          // existing panels (preserve across batches); fresh char sheet kept in images.cast
          const existing: any = from === 0 ? {} : story.images || {};
          let cast: string = existing.cast || "";
          let panels: { beatId: string; url: string }[] = Array.isArray(existing.panels)
            ? existing.panels.slice()
            : [];
          if (!cast) cast = await deriveCharacterSheet(story);

          await storage.updateStoryImages(id, "generating", {
            ...existing,
            cast,
            panels,
            style: "classic-comic",
            total: beats.length,
          });

          const end = Math.min(from + batch, beats.length);
          const stamp = Date.now();
          for (let i = from; i < end; i++) {
            const beat = beats[i];
            const png = await generateComicPanel(beat?.text || "", cast, band);
            const objectPath = `story-${id}/panel-${i + 1}-${stamp}.png`;
            const url = await uploadImage(objectPath, png);
            // replace any existing panel for this beat, keep order by beat index later
            panels = panels.filter((p) => p.beatId !== (beat?.id || `b${i + 1}`));
            panels.push({ beatId: beat?.id || `b${i + 1}`, url });
          }
          // order panels by beat order
          const order = new Map(beats.map((bt: any, i: number) => [bt.id || `b${i + 1}`, i]));
          panels.sort((a, b2) => (order.get(a.beatId) ?? 0) - (order.get(b2.beatId) ?? 0));

          const done = end >= beats.length;
          const images = {
            cast,
            panels,
            style: "classic-comic",
            total: beats.length,
            generated_at: new Date().toISOString(),
          };
          await storage.updateStoryImages(id, done ? "ready" : "generating", images);
          return json(res, 200, {
            done,
            next_from: end,
            total: beats.length,
            completed: panels.length,
            panels,
            image_status: done ? "ready" : "generating",
          });
        } catch (e: any) {
          await storage.updateStoryImages(id, "error", {
            ...(story.images || {}),
            error: String(e?.message || e),
          });
          return json(res, 502, { error: "Comic generation failed.", message: String(e?.message || e) });
        }
      }
      // DELETE /api/stories/:id/comic  -> clear comic
      if (seg[2] === "comic" && seg.length === 3 && method === "DELETE") {
        const updated = await storage.updateStoryImages(id, "none", {});
        return updated ? json(res, 200, updated) : json(res, 404, { error: "not found" });
      }
    }

    // GET /api/voices -> available narration voices
    if (seg[0] === "voices" && seg.length === 1 && method === "GET") {
      return json(res, 200, { voices: TTS_VOICES, default: DEFAULT_TTS_VOICE });
    }

    // ---- /sessions ... ----
    if (seg[0] === "sessions") {
      if (seg.length === 1 && method === "GET") return json(res, 200, await storage.listAllSessions());
      if (seg.length === 1 && method === "POST") {
        const b = await readBody(req);
        if (!b.group_id || !b.story_id) return json(res, 400, { error: "group_id and story_id required" });
        return json(res, 200, await storage.createSession({
          ...b,
          date: b.date || new Date().toISOString().slice(0, 10),
        }));
      }
      const id = Number(seg[1]);
      if (seg.length === 2 && method === "GET") {
        const session = await storage.getSession(id);
        if (!session) return json(res, 404, { error: "not found" });
        const logs = await storage.listLogs(session.id);
        return json(res, 200, { ...session, logs });
      }
      if (seg[2] === "logs" && method === "POST") {
        const b = await readBody(req);
        if (!b.student_id || !b.goal_id) return json(res, 400, { error: "student_id and goal_id required" });
        return json(res, 200, await storage.upsertLog(id, b));
      }
    }

    return json(res, 404, { error: "not found", path });
  } catch (err: any) {
    return json(res, 500, { error: "function_error", message: String(err?.message || err) });
  }
}
