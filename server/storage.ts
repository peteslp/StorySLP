// Supabase REST storage layer for StorySLP. Server-side only.
import type {
  Student,
  Goal,
  Group,
  GroupWithMembers,
  Story,
  Session,
  GoalLog,
  CreateStudentInput,
  CreateGoalInput,
  CreateGroupInput,
  CreateStoryInput,
  CreateSessionInput,
  LogInput,
  GoalCoverage,
  Beat,
  StopPoint,
} from "../shared/schema";

const SUPABASE_URL =
  process.env.SUPABASE_URL || "https://jdqdyomxtpzyqiisepfj.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  "sb_publishable_4Z0i1Njbxz1p9S5Tnk6z9w_6lHNQ0_g";

const REST = `${SUPABASE_URL}/rest/v1`;

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function sb<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${REST}${path}`, {
    ...init,
    headers: { ...headers(), ...(init?.headers as Record<string, string>) },
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

function parseStoryRow(r: any): Story {
  return {
    id: r.id,
    group_id: r.group_id,
    title: r.title,
    status: r.status,
    est_minutes: r.est_minutes,
    beats: safeParse<Beat[]>(r.beats_json, []),
    stop_points: safeParse<StopPoint[]>(r.stop_points_json, []),
    target_goal_ids: safeParse<number[]>(r.target_goal_ids_json, []),
    audio_status: r.audio_status,
    audio_json: r.audio_json,
    image_status: r.image_status,
    images_json: r.images_json,
  };
}
function safeParse<T>(s: any, fallback: T): T {
  try {
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
}

export const storage = {
  // ---------- Students ----------
  listStudents(): Promise<Student[]> {
    return sb<Student[]>(`/students?order=id.asc`);
  },
  async createStudent(input: CreateStudentInput): Promise<Student> {
    // pick a color and a default home group_id (first group, if any)
    const groups = await sb<Group[]>(`/groups?order=id.asc&limit=1`);
    const homeGroup = groups[0]?.id ?? null;
    const existing = await sb<Student[]>(`/students?select=color`);
    const used = new Set(existing.map((s) => s.color));
    const color =
      input.color || PALETTE.find((c) => !used.has(c)) || PALETTE[existing.length % PALETTE.length];
    const rows = await sb<Student[]>(`/students`, {
      method: "POST",
      headers: repr,
      body: JSON.stringify({
        name: input.name,
        grade: input.grade ?? null,
        color,
        group_id: homeGroup ?? 0, // group_id is NOT NULL in legacy schema; 0 = unassigned sentinel
      }),
    });
    const student = rows[0];
    // also add to home group membership if one exists
    if (homeGroup) {
      await this.addMember(homeGroup, student.id).catch(() => {});
    }
    return student;
  },
  async updateStudent(id: number, input: Partial<CreateStudentInput>): Promise<Student | undefined> {
    const rows = await sb<Student[]>(`/students?id=eq.${id}`, {
      method: "PATCH",
      headers: repr,
      body: JSON.stringify(input),
    });
    return rows[0];
  },
  async deleteStudent(id: number): Promise<void> {
    // Clean up dependents that lack FK cascade, then delete student.
    await sb<null>(`/group_members?student_id=eq.${id}`, { method: "DELETE" }).catch(() => {});
    await sb<null>(`/goal_logs?student_id=eq.${id}`, { method: "DELETE" }).catch(() => {});
    await sb<null>(`/goals?student_id=eq.${id}`, { method: "DELETE" }).catch(() => {});
    await sb<null>(`/students?id=eq.${id}`, { method: "DELETE" });
  },

  // ---------- Goals ----------
  listGoals(studentId: number): Promise<Goal[]> {
    return sb<Goal[]>(`/goals?student_id=eq.${studentId}&order=id.asc`);
  },
  async createGoal(input: CreateGoalInput): Promise<Goal> {
    const rows = await sb<Goal[]>(`/goals`, {
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
  async updateGoal(id: number, input: Partial<CreateGoalInput>): Promise<Goal | undefined> {
    const rows = await sb<Goal[]>(`/goals?id=eq.${id}`, {
      method: "PATCH",
      headers: repr,
      body: JSON.stringify(input),
    });
    return rows[0];
  },
  async deleteGoal(id: number): Promise<void> {
    await sb<null>(`/goal_logs?goal_id=eq.${id}`, { method: "DELETE" }).catch(() => {});
    await sb<null>(`/goals?id=eq.${id}`, { method: "DELETE" });
  },

  // ---------- Groups + membership ----------
  async listGroups(): Promise<GroupWithMembers[]> {
    const groups = await sb<Group[]>(`/groups?order=id.asc`);
    const members = await sb<{ group_id: number; student_id: number }[]>(
      `/group_members?select=group_id,student_id`,
    );
    const students = await sb<Student[]>(`/students?order=id.asc`);
    const sById = new Map(students.map((s) => [s.id, s]));
    return groups.map((g) => {
      const mem = members
        .filter((m) => m.group_id === g.id)
        .map((m) => sById.get(m.student_id))
        .filter(Boolean) as Student[];
      return { ...g, members: mem, studentCount: mem.length };
    });
  },
  async createGroup(input: CreateGroupInput): Promise<Group> {
    const rows = await sb<Group[]>(`/groups`, {
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
  async updateGroup(id: number, input: Partial<CreateGroupInput>): Promise<Group | undefined> {
    const rows = await sb<Group[]>(`/groups?id=eq.${id}`, {
      method: "PATCH",
      headers: repr,
      body: JSON.stringify(input),
    });
    return rows[0];
  },
  async deleteGroup(id: number): Promise<void> {
    await sb<null>(`/group_members?group_id=eq.${id}`, { method: "DELETE" }).catch(() => {});
    await sb<null>(`/groups?id=eq.${id}`, { method: "DELETE" });
  },
  async addMember(groupId: number, studentId: number): Promise<void> {
    // ignore duplicate (unique constraint) errors
    await sb<null>(`/group_members`, {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates" },
      body: JSON.stringify({ group_id: groupId, student_id: studentId }),
    }).catch((e) => {
      if (!String(e).includes("409") && !String(e).includes("duplicate")) throw e;
    });
  },
  async removeMember(groupId: number, studentId: number): Promise<void> {
    await sb<null>(
      `/group_members?group_id=eq.${groupId}&student_id=eq.${studentId}`,
      { method: "DELETE" },
    );
  },
  async moveStudent(studentId: number, toGroupId: number, fromGroupId?: number): Promise<void> {
    if (fromGroupId) await this.removeMember(fromGroupId, studentId);
    await this.addMember(toGroupId, studentId);
  },
  async groupsForStudent(studentId: number): Promise<number[]> {
    const rows = await sb<{ group_id: number }[]>(
      `/group_members?student_id=eq.${studentId}&select=group_id`,
    );
    return rows.map((r) => r.group_id);
  },

  // ---------- Stories ----------
  async listStories(groupId: number): Promise<Story[]> {
    const rows = await sb<any[]>(`/stories?group_id=eq.${groupId}&order=id.desc`);
    return rows.map(parseStoryRow);
  },
  async listAllStories(): Promise<Story[]> {
    const rows = await sb<any[]>(`/stories?order=id.desc`);
    return rows.map(parseStoryRow);
  },
  async getStory(id: number): Promise<Story | undefined> {
    const rows = await sb<any[]>(`/stories?id=eq.${id}`);
    return rows[0] ? parseStoryRow(rows[0]) : undefined;
  },
  async createStory(input: CreateStoryInput): Promise<Story> {
    const rows = await sb<any[]>(`/stories`, {
      method: "POST",
      headers: repr,
      body: JSON.stringify({
        group_id: input.group_id,
        title: input.title,
        status: input.status ?? "draft",
        est_minutes: input.est_minutes,
        beats_json: JSON.stringify(input.beats),
        stop_points_json: JSON.stringify(input.stop_points),
        target_goal_ids_json: JSON.stringify(input.target_goal_ids),
        audio_status: "none",
        audio_json: "{}",
        image_status: "none",
        images_json: "{}",
      }),
    });
    return parseStoryRow(rows[0]);
  },
  async updateStory(id: number, input: any): Promise<Story | undefined> {
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
  async deleteStory(id: number): Promise<void> {
    await sb<null>(`/stories?id=eq.${id}`, { method: "DELETE" });
  },

  // ---------- Sessions + logs ----------
  async listSessions(groupId: number): Promise<Session[]> {
    return sb<Session[]>(`/sessions?group_id=eq.${groupId}&order=id.desc`);
  },
  async listAllSessions(): Promise<Session[]> {
    return sb<Session[]>(`/sessions?order=id.desc`);
  },
  async getSession(id: number): Promise<Session | undefined> {
    const rows = await sb<Session[]>(`/sessions?id=eq.${id}`);
    return rows[0];
  },
  async createSession(input: CreateSessionInput): Promise<Session> {
    const rows = await sb<Session[]>(`/sessions`, {
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
  listLogs(sessionId: number): Promise<GoalLog[]> {
    return sb<GoalLog[]>(`/goal_logs?session_id=eq.${sessionId}&order=id.asc`);
  },
  async upsertLog(sessionId: number, input: LogInput): Promise<GoalLog> {
    const filter = `/goal_logs?session_id=eq.${sessionId}&student_id=eq.${input.student_id}&goal_id=eq.${input.goal_id}`;
    const existing = await sb<GoalLog[]>(filter);
    const payload = {
      session_id: sessionId,
      student_id: input.student_id,
      goal_id: input.goal_id,
      trials: input.trials,
      correct: input.correct,
      prompted: input.prompted,
      note: input.note ?? null,
    };
    if (existing.length > 0) {
      const rows = await sb<GoalLog[]>(filter, {
        method: "PATCH",
        headers: repr,
        body: JSON.stringify(payload),
      });
      return rows[0];
    }
    const rows = await sb<GoalLog[]>(`/goal_logs`, {
      method: "POST",
      headers: repr,
      body: JSON.stringify(payload),
    });
    return rows[0];
  },

  // ---------- Coverage (rank under-targeted goals) ----------
  async coverage(groupId: number): Promise<GoalCoverage[]> {
    const groups = await this.listGroups();
    const group = groups.find((g) => g.id === groupId);
    if (!group) return [];
    const memberIds = group.members.map((m) => m.id);
    if (memberIds.length === 0) return [];
    const inList = `(${memberIds.join(",")})`;
    const goals = await sb<Goal[]>(`/goals?student_id=in.${inList}&active=is.true&order=id.asc`);
    const studentsById = new Map(group.members.map((m) => [m.id, m]));
    const sessions = await sb<Session[]>(`/sessions?group_id=eq.${groupId}`);
    const sessionIds = sessions.map((s) => s.id);
    let logs: GoalLog[] = [];
    if (sessionIds.length) {
      logs = await sb<GoalLog[]>(`/goal_logs?session_id=in.(${sessionIds.join(",")})`);
    }
    const sessionDate = new Map(sessions.map((s) => [s.id, s.date]));
    return goals.map((g) => {
      const gLogs = logs.filter((l) => l.goal_id === g.id);
      const total_trials = gLogs.reduce((a, l) => a + l.trials, 0);
      const total_correct = gLogs.reduce((a, l) => a + l.correct, 0);
      const dates = gLogs
        .map((l) => sessionDate.get(l.session_id))
        .filter(Boolean) as string[];
      const last = dates.sort().slice(-1)[0] ?? null;
      return {
        goal_id: g.id,
        student_id: g.student_id,
        student_name: studentsById.get(g.student_id)?.name ?? "?",
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

  // active goals for all members of a group (used by generator)
  async activeGoalsForGroup(
    groupId: number,
  ): Promise<{ student: Student; goals: Goal[] }[]> {
    const groups = await this.listGroups();
    const group = groups.find((g) => g.id === groupId);
    if (!group) return [];
    const out: { student: Student; goals: Goal[] }[] = [];
    for (const s of group.members) {
      const goals = await sb<Goal[]>(
        `/goals?student_id=eq.${s.id}&active=is.true&order=id.asc`,
      );
      out.push({ student: s, goals });
    }
    return out;
  },
};

export { SUPABASE_URL, SUPABASE_ANON_KEY };
