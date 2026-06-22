import type { Express, Request, Response } from "express";
import type { Server } from "node:http";
import { storage } from "./storage";
import { generateStory, GenerationUnavailableError } from "./generate";

function wrap(fn: (req: Request, res: Response) => Promise<any>) {
  return (req: Request, res: Response) => {
    fn(req, res).catch((err) => {
      console.error("API error:", err);
      res.status(500).json({ error: String(err?.message || err) });
    });
  };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  // ---------- Students ----------
  app.get("/api/students", wrap(async (_req, res) => {
    res.json(await storage.listStudents());
  }));
  app.post("/api/students", wrap(async (req, res) => {
    const { name, grade, color } = req.body || {};
    if (!name) return res.status(400).json({ error: "name required" });
    res.json(await storage.createStudent({ name, grade, color }));
  }));
  app.patch("/api/students/:id", wrap(async (req, res) => {
    const updated = await storage.updateStudent(Number(req.params.id), req.body || {});
    if (!updated) return res.status(404).json({ error: "not found" });
    res.json(updated);
  }));
  app.delete("/api/students/:id", wrap(async (req, res) => {
    await storage.deleteStudent(Number(req.params.id));
    res.json({ ok: true });
  }));
  app.get("/api/students/:id/goals", wrap(async (req, res) => {
    res.json(await storage.listGoals(Number(req.params.id)));
  }));
  app.get("/api/students/:id/groups", wrap(async (req, res) => {
    res.json(await storage.groupsForStudent(Number(req.params.id)));
  }));
  app.post("/api/students/:id/move", wrap(async (req, res) => {
    const { to_group_id, from_group_id } = req.body || {};
    if (!to_group_id) return res.status(400).json({ error: "to_group_id required" });
    await storage.moveStudent(Number(req.params.id), Number(to_group_id), from_group_id ? Number(from_group_id) : undefined);
    res.json({ ok: true });
  }));

  // ---------- Goals ----------
  app.post("/api/goals", wrap(async (req, res) => {
    const { student_id, label, text, goal_type, target_criteria, active } = req.body || {};
    if (!student_id || !label || !text || !goal_type || !target_criteria)
      return res.status(400).json({ error: "student_id, label, text, goal_type, target_criteria required" });
    res.json(await storage.createGoal({ student_id, label, text, goal_type, target_criteria, active }));
  }));
  app.patch("/api/goals/:id", wrap(async (req, res) => {
    const updated = await storage.updateGoal(Number(req.params.id), req.body || {});
    if (!updated) return res.status(404).json({ error: "not found" });
    res.json(updated);
  }));
  app.delete("/api/goals/:id", wrap(async (req, res) => {
    await storage.deleteGoal(Number(req.params.id));
    res.json({ ok: true });
  }));

  // ---------- Groups + membership ----------
  app.get("/api/groups", wrap(async (_req, res) => {
    res.json(await storage.listGroups());
  }));
  app.post("/api/groups", wrap(async (req, res) => {
    const { name, schedule, day_of_week } = req.body || {};
    if (!name) return res.status(400).json({ error: "name required" });
    res.json(await storage.createGroup({ name, schedule, day_of_week }));
  }));
  app.patch("/api/groups/:id", wrap(async (req, res) => {
    const updated = await storage.updateGroup(Number(req.params.id), req.body || {});
    if (!updated) return res.status(404).json({ error: "not found" });
    res.json(updated);
  }));
  app.delete("/api/groups/:id", wrap(async (req, res) => {
    await storage.deleteGroup(Number(req.params.id));
    res.json({ ok: true });
  }));
  app.post("/api/groups/:id/members", wrap(async (req, res) => {
    const { student_id } = req.body || {};
    if (!student_id) return res.status(400).json({ error: "student_id required" });
    await storage.addMember(Number(req.params.id), Number(student_id));
    res.json({ ok: true });
  }));
  app.delete("/api/groups/:id/members/:studentId", wrap(async (req, res) => {
    await storage.removeMember(Number(req.params.id), Number(req.params.studentId));
    res.json({ ok: true });
  }));

  // ---------- Stories ----------
  app.get("/api/stories", wrap(async (_req, res) => {
    res.json(await storage.listAllStories());
  }));
  app.get("/api/groups/:id/stories", wrap(async (req, res) => {
    res.json(await storage.listStories(Number(req.params.id)));
  }));
  app.get("/api/stories/:id", wrap(async (req, res) => {
    const story = await storage.getStory(Number(req.params.id));
    if (!story) return res.status(404).json({ error: "not found" });
    res.json(story);
  }));
  app.post("/api/stories", wrap(async (req, res) => {
    const { group_id, title, est_minutes, beats, stop_points, target_goal_ids, status } = req.body || {};
    if (!group_id || !title) return res.status(400).json({ error: "group_id and title required" });
    res.json(await storage.createStory({
      group_id, title, est_minutes: est_minutes ?? 15,
      beats: beats ?? [], stop_points: stop_points ?? [], target_goal_ids: target_goal_ids ?? [], status,
    }));
  }));
  app.patch("/api/stories/:id", wrap(async (req, res) => {
    const updated = await storage.updateStory(Number(req.params.id), req.body || {});
    if (!updated) return res.status(404).json({ error: "not found" });
    res.json(updated);
  }));
  app.delete("/api/stories/:id", wrap(async (req, res) => {
    await storage.deleteStory(Number(req.params.id));
    res.json({ ok: true });
  }));

  // ---------- Generate (the core feature) ----------
  app.post("/api/stories/generate", wrap(async (req, res) => {
    const { group_id, theme } = req.body || {};
    if (!group_id) return res.status(400).json({ error: "group_id required" });
    const members = await storage.activeGoalsForGroup(Number(group_id));
    if (members.length === 0)
      return res.status(400).json({ error: "This group has no students with active goals." });
    try {
      const gen = await generateStory(members, { theme });
      const story = await storage.createStory({
        group_id: Number(group_id),
        title: gen.title,
        est_minutes: gen.est_minutes,
        beats: gen.beats,
        stop_points: gen.stop_points,
        target_goal_ids: gen.target_goal_ids,
        status: "draft",
      });
      res.json(story);
    } catch (e: any) {
      if (e instanceof GenerationUnavailableError)
        return res.status(503).json({ error: e.message, unavailable: true });
      throw e;
    }
  }));

  // ---------- Sessions + logs ----------
  app.get("/api/sessions", wrap(async (_req, res) => {
    res.json(await storage.listAllSessions());
  }));
  app.get("/api/groups/:id/sessions", wrap(async (req, res) => {
    res.json(await storage.listSessions(Number(req.params.id)));
  }));
  app.get("/api/sessions/:id", wrap(async (req, res) => {
    const session = await storage.getSession(Number(req.params.id));
    if (!session) return res.status(404).json({ error: "not found" });
    const logs = await storage.listLogs(session.id);
    res.json({ ...session, logs });
  }));
  app.post("/api/sessions", wrap(async (req, res) => {
    const { group_id, story_id, date, notes } = req.body || {};
    if (!group_id || !story_id) return res.status(400).json({ error: "group_id and story_id required" });
    res.json(await storage.createSession({
      group_id, story_id, date: date || new Date().toISOString().slice(0, 10), notes,
    }));
  }));
  app.post("/api/sessions/:id/logs", wrap(async (req, res) => {
    const { student_id, goal_id, trials, correct, prompted, note } = req.body || {};
    if (!student_id || !goal_id) return res.status(400).json({ error: "student_id and goal_id required" });
    res.json(await storage.upsertLog(Number(req.params.id), {
      student_id, goal_id, trials: trials ?? 0, correct: correct ?? 0, prompted: prompted ?? 0, note,
    }));
  }));

  // ---------- Coverage ----------
  app.get("/api/groups/:id/coverage", wrap(async (req, res) => {
    res.json(await storage.coverage(Number(req.params.id)));
  }));

  return httpServer;
}
