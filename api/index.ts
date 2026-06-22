// Vercel serverless API for StorySLP — fully self-contained (no relative imports, no Express).
// Mirrors server/routes.ts + server/storage.ts. Talks to Supabase REST directly.
// Story generation requires LLM credentials only available in the authoring sandbox,
// so on the live site /api/stories/generate returns 503 (graceful "unavailable").

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
    audio_json: r.audio_json,
    image_status: r.image_status,
    images_json: r.images_json,
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
    // ---- health ----
    if (path === "/health") return json(res, 200, { ok: true });

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
        // Story generation requires LLM credentials only present in the authoring sandbox.
        return json(res, 503, {
          error:
            "Story generation runs in the authoring environment and is not available on the live site. Generate new stories there, then they appear here for everyone.",
          unavailable: true,
        });
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
