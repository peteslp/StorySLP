import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  GraduationCap,
  Plus,
  Pencil,
  Trash2,
  Target,
  TrendingUp,
} from "lucide-react";
import type { Student, Goal, GroupWithMembers } from "@shared/schema";
import { AppShell } from "@/components/AppShell";
import { StudentChip } from "@/components/StudentChip";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PRESET_COLORS, goalTypeLabel, contrastText, getJSON, formatDate } from "@/lib/storyslp";

const GOAL_TYPES = [
  "vocab",
  "artic_s",
  "artic_th",
  "main_idea",
  "restate_active",
  "figurative",
];

export default function Students() {
  const { toast } = useToast();
  const studentsQ = useQuery<Student[]>({ queryKey: ["/api/students"] });
  const groupsQ = useQuery<GroupWithMembers[]>({ queryKey: ["/api/groups"] });

  const students = studentsQ.data ?? [];
  const groups = groupsQ.data ?? [];

  const groupsForStudent = (id: number) =>
    groups.filter((g) => g.members.some((m) => m.id === id));

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [name, setName] = useState("");
  const [grade, setGrade] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[0]);

  const [goalsFor, setGoalsFor] = useState<Student | null>(null);
  const [progressFor, setProgressFor] = useState<Student | null>(null);
  const [deleteStudent, setDeleteStudent] = useState<Student | null>(null);

  const openCreate = () => {
    setEditing(null);
    setName("");
    setGrade("");
    setColor(PRESET_COLORS[0]);
    setFormOpen(true);
  };
  const openEdit = (s: Student) => {
    setEditing(s);
    setName(s.name);
    setGrade(s.grade ?? "");
    setColor(s.color || PRESET_COLORS[0]);
    setFormOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      const body = { name, grade: grade || null, color };
      if (editing) return apiRequest("PATCH", `/api/students/${editing.id}`, body);
      return apiRequest("POST", "/api/students", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/students"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      setFormOpen(false);
      toast({ title: editing ? "Student updated" : "Student added" });
    },
    onError: (e: Error) =>
      toast({ title: "Could not save student", description: e.message, variant: "destructive" }),
  });

  const del = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/students/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/students"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      setDeleteStudent(null);
      toast({ title: "Student deleted" });
    },
    onError: (e: Error) =>
      toast({ title: "Could not delete student", description: e.message, variant: "destructive" }),
  });

  return (
    <AppShell>
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-6 w-6 text-primary" />
          <h1 className="font-display text-xl font-bold">Students &amp; Goals</h1>
        </div>
        <Button onClick={openCreate} data-testid="button-new-student">
          <Plus className="mr-1 h-4 w-4" />
          New student
        </Button>
      </div>

      {studentsQ.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : students.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <GraduationCap className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No students yet. Add your first student to begin.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {students.map((s) => {
            const inGroups = groupsForStudent(s.id);
            return (
              <Card key={s.id} data-testid={`card-student-${s.id}`}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <StudentChip id={s.id} name={s.name} color={s.color} variant="badge" />
                      <div>
                        <div className="font-display text-sm font-semibold" data-testid={`text-student-name-${s.id}`}>
                          {s.name}
                        </div>
                        {s.grade ? (
                          <div className="text-xs text-muted-foreground">{s.grade}</div>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(s)}
                        data-testid={`button-edit-student-${s.id}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteStudent(s)}
                        data-testid={`button-delete-student-${s.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {inGroups.length === 0 ? (
                      <span className="text-xs text-muted-foreground">No groups</span>
                    ) : (
                      inGroups.map((g) => (
                        <Badge key={g.id} variant="secondary" className="font-normal">
                          {g.name}
                        </Badge>
                      ))
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => setGoalsFor(s)}
                      data-testid={`button-manage-goals-${s.id}`}
                    >
                      <Target className="mr-1 h-4 w-4" />
                      Manage goals
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => setProgressFor(s)}
                      data-testid={`button-view-progress-${s.id}`}
                    >
                      <TrendingUp className="mr-1 h-4 w-4" />
                      View progress
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create / edit student dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">
              {editing ? "Edit student" : "New student"}
            </DialogTitle>
            <DialogDescription>
              The color is the student&apos;s identity chip everywhere in the app.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="student-name">Name</Label>
              <Input
                id="student-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Jordan P."
                data-testid="input-student-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="student-grade">Grade</Label>
              <Input
                id="student-grade"
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                placeholder="e.g. 3rd"
                data-testid="input-student-grade"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Identity color</Label>
              <div className="flex flex-wrap items-center gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className="h-8 w-8 rounded-full border-2 transition-transform hover:scale-110"
                    style={{
                      backgroundColor: c,
                      borderColor: color === c ? "var(--ring)" : "transparent",
                    }}
                    data-testid={`swatch-${c}`}
                    aria-label={`Color ${c}`}
                  >
                    {color === c ? (
                      <span style={{ color: contrastText(c) }}>✓</span>
                    ) : null}
                  </button>
                ))}
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-8 w-8 cursor-pointer rounded border bg-transparent"
                  data-testid="input-student-color"
                  aria-label="Custom color"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => save.mutate()}
              disabled={!name.trim() || save.isPending}
              data-testid="button-save-student"
            >
              {save.isPending ? "Saving…" : editing ? "Save changes" : "Add student"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Goal manager */}
      {goalsFor && (
        <GoalManager student={goalsFor} onClose={() => setGoalsFor(null)} />
      )}

      {progressFor && (
        <StudentProgress student={progressFor} onClose={() => setProgressFor(null)} />
      )}

      {/* Delete confirm */}
      <AlertDialog
        open={deleteStudent !== null}
        onOpenChange={(o) => !o && setDeleteStudent(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteStudent?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the student along with their goals, group
              memberships, and goal logs. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-student">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteStudent && del.mutate(deleteStudent.id)}
              data-testid="button-confirm-delete-student"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function GoalManager({ student, onClose }: { student: Student; onClose: () => void }) {
  const { toast } = useToast();
  const goalsQ = useQuery<Goal[]>({
    queryKey: ["/api/students", student.id, "goals"],
  });
  const goals = goalsQ.data ?? [];

  const [editing, setEditing] = useState<Goal | null>(null);
  const [label, setLabel] = useState("");
  const [text, setText] = useState("");
  const [goalType, setGoalType] = useState(GOAL_TYPES[0]);
  const [criteria, setCriteria] = useState("80%");
  const [active, setActive] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [deleteGoal, setDeleteGoal] = useState<Goal | null>(null);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["/api/students", student.id, "goals"] });

  const resetForm = () => {
    setEditing(null);
    setLabel("");
    setText("");
    setGoalType(GOAL_TYPES[0]);
    setCriteria("80%");
    setActive(true);
  };

  const openAdd = () => {
    resetForm();
    setShowForm(true);
  };
  const openEdit = (g: Goal) => {
    setEditing(g);
    setLabel(g.label);
    setText(g.text);
    setGoalType(g.goal_type);
    setCriteria(g.target_criteria);
    setActive(g.active);
    setShowForm(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        student_id: student.id,
        label,
        text,
        goal_type: goalType,
        target_criteria: criteria,
        active,
      };
      if (editing) return apiRequest("PATCH", `/api/goals/${editing.id}`, body);
      return apiRequest("POST", "/api/goals", body);
    },
    onSuccess: () => {
      invalidate();
      setShowForm(false);
      resetForm();
      toast({ title: editing ? "Goal updated" : "Goal added" });
    },
    onError: (e: Error) =>
      toast({ title: "Could not save goal", description: e.message, variant: "destructive" }),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, value }: { id: number; value: boolean }) =>
      apiRequest("PATCH", `/api/goals/${id}`, { active: value }),
    onSuccess: invalidate,
    onError: (e: Error) =>
      toast({ title: "Could not update goal", description: e.message, variant: "destructive" }),
  });

  const del = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/goals/${id}`),
    onSuccess: () => {
      invalidate();
      setDeleteGoal(null);
      toast({ title: "Goal deleted" });
    },
    onError: (e: Error) =>
      toast({ title: "Could not delete goal", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <StudentChip id={student.id} name={student.name} color={student.color} variant="badge" />
            {student.name} — Goals
          </DialogTitle>
          <DialogDescription>
            Manage IEP goals. Only active goals are woven into generated stories.
          </DialogDescription>
        </DialogHeader>

        {goalsQ.isLoading ? (
          <Skeleton className="h-24 rounded-lg" />
        ) : goals.length === 0 ? (
          <p className="text-sm text-muted-foreground">No goals yet.</p>
        ) : (
          <div className="space-y-2">
            {goals.map((g) => (
              <div
                key={g.id}
                className="rounded-lg border p-3"
                data-testid={`row-goal-${g.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{g.label}</span>
                      <Badge variant="outline" className="font-normal">
                        {goalTypeLabel(g.goal_type)}
                      </Badge>
                      <Badge variant="secondary" className="font-normal">
                        {g.target_criteria}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{g.text}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Switch
                      checked={g.active}
                      onCheckedChange={(v) => toggleActive.mutate({ id: g.id, value: v })}
                      data-testid={`switch-goal-active-${g.id}`}
                      aria-label="Toggle active"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(g)}
                      data-testid={`button-edit-goal-${g.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteGoal(g)}
                      data-testid={`button-delete-goal-${g.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {showForm ? (
          <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
            <div className="space-y-1.5">
              <Label htmlFor="goal-label">Label</Label>
              <Input
                id="goal-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Context-clue vocabulary"
                data-testid="input-goal-label"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="goal-text">Full goal text</Label>
              <Textarea
                id="goal-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Given a grade-level passage, the student will…"
                data-testid="input-goal-text"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Goal type</Label>
                <Select value={goalType} onValueChange={setGoalType}>
                  <SelectTrigger data-testid="select-goal-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GOAL_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {goalTypeLabel(t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="goal-criteria">Target criteria</Label>
                <Input
                  id="goal-criteria"
                  value={criteria}
                  onChange={(e) => setCriteria(e.target.value)}
                  placeholder="80%"
                  data-testid="input-goal-criteria"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={active}
                onCheckedChange={setActive}
                data-testid="switch-goal-form-active"
              />
              <Label className="text-sm font-normal">Active</Label>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                data-testid="button-cancel-goal"
              >
                Cancel
              </Button>
              <Button
                onClick={() => save.mutate()}
                disabled={!label.trim() || !text.trim() || save.isPending}
                data-testid="button-save-goal"
              >
                {save.isPending ? "Saving…" : editing ? "Save goal" : "Add goal"}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" onClick={openAdd} data-testid="button-add-goal">
            <Plus className="mr-1 h-4 w-4" />
            Add goal
          </Button>
        )}
      </DialogContent>

      <AlertDialog open={deleteGoal !== null} onOpenChange={(o) => !o && setDeleteGoal(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this goal?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the goal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-goal">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteGoal && del.mutate(deleteGoal.id)}
              data-testid="button-confirm-delete-goal"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

type ProgressSession = {
  session_id: number;
  date: string;
  story_title: string | null;
  trials: number;
  correct: number;
  prompted: number;
  accuracy: number | null;
};

type ProgressGoal = {
  goal_id: number;
  label: string;
  goal_type: string;
  target_criteria: string;
  active: boolean;
  sessions: ProgressSession[];
  session_count: number;
  total_trials: number;
  total_correct: number;
  total_prompted: number;
  overall_accuracy: number | null;
};

function accuracyTone(pct: number): string {
  if (pct >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (pct >= 60) return "text-amber-600 dark:text-amber-400";
  return "text-destructive";
}

function Sparkbars({ sessions }: { sessions: ProgressSession[] }) {
  if (sessions.length === 0) return null;
  return (
    <div className="flex items-end gap-1 h-12" data-testid="sparkbars">
      {sessions.map((s) => (
        <div
          key={s.session_id}
          className="flex-1 min-w-[6px] rounded-sm bg-primary/80"
          style={{ height: `${Math.max(4, s.accuracy ?? 0)}%` }}
          title={`${formatDate(s.date)}: ${s.accuracy ?? 0}%`}
        />
      ))}
    </div>
  );
}

function StudentProgress({
  student,
  onClose,
}: {
  student: Student;
  onClose: () => void;
}) {
  const progressQ = useQuery<{ goals: ProgressGoal[] }>({
    queryKey: ["/api/students", student.id, "progress"],
    queryFn: () =>
      getJSON<{ goals: ProgressGoal[] }>(`/api/students/${student.id}/progress`),
  });

  const goals = progressQ.data?.goals ?? [];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-2xl max-h-[88vh] overflow-y-auto"
        data-testid="dialog-student-progress"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            {student.name} — goal progress
          </DialogTitle>
          <DialogDescription>
            Accuracy per session and overall average for each goal.
          </DialogDescription>
        </DialogHeader>

        {progressQ.isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : goals.length === 0 ? (
          <p
            className="py-8 text-center text-sm text-muted-foreground"
            data-testid="text-no-goals"
          >
            No goals yet for this student.
          </p>
        ) : (
          <div className="space-y-6">
            {goals.map((g) => (
              <Card key={g.goal_id} data-testid={`card-progress-goal-${g.goal_id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        {goalTypeLabel(g.goal_type)}
                      </span>
                      <p className="truncate font-medium">{g.label}</p>
                      <p className="text-xs text-muted-foreground">
                        Target {g.target_criteria}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p
                        className="text-3xl font-bold text-primary leading-none"
                        data-testid={`text-overall-${g.goal_id}`}
                      >
                        {g.session_count > 0 ? `${g.overall_accuracy}%` : "—"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {g.total_correct}/{g.total_trials} trials ·{" "}
                        {g.session_count} session{g.session_count === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>

                  {g.sessions.length === 0 ? (
                    <p
                      className="mt-4 text-sm text-muted-foreground"
                      data-testid={`text-no-sessions-${g.goal_id}`}
                    >
                      No sessions logged yet.
                    </p>
                  ) : (
                    <>
                      <div className="mt-4">
                        <Sparkbars sessions={g.sessions} />
                      </div>
                      <div className="mt-3 overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                              <th className="py-1 pr-2">Session</th>
                              <th className="py-1 pr-2">Story</th>
                              <th className="py-1 pr-2 text-right">Trials</th>
                              <th className="py-1 pr-2 text-right">Correct</th>
                              <th className="py-1 pr-2 text-right">Prompted</th>
                              <th className="py-1 text-right">Accuracy</th>
                            </tr>
                          </thead>
                          <tbody>
                            {g.sessions.map((s) => (
                              <tr
                                key={s.session_id}
                                className="border-t border-border"
                                data-testid={`row-session-${g.goal_id}-${s.session_id}`}
                              >
                                <td className="py-1.5 pr-2 whitespace-nowrap">
                                  {formatDate(s.date)}
                                </td>
                                <td className="py-1.5 pr-2 max-w-[140px] truncate">
                                  {s.story_title ?? "—"}
                                </td>
                                <td className="py-1.5 pr-2 text-right tabular-nums">
                                  {s.trials}
                                </td>
                                <td className="py-1.5 pr-2 text-right tabular-nums">
                                  {s.correct}
                                </td>
                                <td className="py-1.5 pr-2 text-right tabular-nums">
                                  {s.prompted}
                                </td>
                                <td
                                  className={`py-1.5 text-right font-medium tabular-nums ${accuracyTone(s.accuracy ?? 0)}`}
                                >
                                  {s.accuracy ?? 0}%
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
