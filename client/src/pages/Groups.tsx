import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Users,
  Plus,
  Settings2,
  Sparkles,
  BookOpen,
  Play,
  Check,
  Trash2,
  UserPlus,
  ArrowLeftRight,
  Eye,
} from "lucide-react";
import type {
  GroupWithMembers,
  Student,
  Story,
  GoalCoverage,
} from "@shared/schema";
import { AppShell } from "@/components/AppShell";
import { StudentChip } from "@/components/StudentChip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DAY_NAMES, dayName, goalTypeLabel, formatDate } from "@/lib/storyslp";

export default function Groups() {
  const { toast } = useToast();
  const groupsQ = useQuery<GroupWithMembers[]>({ queryKey: ["/api/groups"] });
  const studentsQ = useQuery<Student[]>({ queryKey: ["/api/students"] });

  const groups = groupsQ.data ?? [];
  const students = studentsQ.data ?? [];

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [schedule, setSchedule] = useState("");
  const [day, setDay] = useState("none");

  const [detailGroup, setDetailGroup] = useState<GroupWithMembers | null>(null);
  const [genGroup, setGenGroup] = useState<GroupWithMembers | null>(null);

  const createGroup = useMutation({
    mutationFn: async () => {
      const body = {
        name,
        schedule: schedule || null,
        day_of_week: day === "none" ? null : Number(day),
      };
      return (await apiRequest("POST", "/api/groups", body)).json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      setCreateOpen(false);
      setName("");
      setSchedule("");
      setDay("none");
      toast({ title: "Group created" });
    },
    onError: (e: Error) =>
      toast({ title: "Could not create group", description: e.message, variant: "destructive" }),
  });

  // Keep detail dialog data fresh after invalidations.
  const liveDetail = detailGroup
    ? groups.find((g) => g.id === detailGroup.id) ?? detailGroup
    : null;

  return (
    <AppShell>
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Users className="h-6 w-6 text-primary" />
          <h1 className="font-display text-xl font-bold">Groups</h1>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-group">
              <Plus className="mr-1 h-4 w-4" />
              New group
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-display">New group</DialogTitle>
              <DialogDescription>
                Create a therapy group, then add students to it.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="group-name">Name</Label>
                <Input
                  id="group-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Tuesday 3rd Grade"
                  data-testid="input-group-name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="group-schedule">Schedule</Label>
                <Input
                  id="group-schedule"
                  value={schedule}
                  onChange={(e) => setSchedule(e.target.value)}
                  placeholder="e.g. 10:30–11:00"
                  data-testid="input-group-schedule"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Day of week</Label>
                <Select value={day} onValueChange={setDay}>
                  <SelectTrigger data-testid="select-group-day">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {DAY_NAMES.map((d, i) => (
                      <SelectItem key={i} value={String(i)}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => createGroup.mutate()}
                disabled={!name.trim() || createGroup.isPending}
                data-testid="button-save-group"
              >
                {createGroup.isPending ? "Creating…" : "Create group"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {groupsQ.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {groups.map((g) => (
            <GroupCard
              key={g.id}
              group={g}
              onManage={() => setDetailGroup(g)}
              onGenerate={() => setGenGroup(g)}
            />
          ))}
        </div>
      )}

      {liveDetail && (
        <GroupDetailDialog
          group={liveDetail}
          allStudents={students}
          allGroups={groups}
          onClose={() => setDetailGroup(null)}
        />
      )}

      {genGroup && (
        <GenerateDialog group={genGroup} onClose={() => setGenGroup(null)} />
      )}
    </AppShell>
  );
}

function EmptyState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
        <Users className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          No groups yet. Create your first group to start building stories.
        </p>
      </CardContent>
    </Card>
  );
}

function GroupCard({
  group,
  onManage,
  onGenerate,
}: {
  group: GroupWithMembers;
  onManage: () => void;
  onGenerate: () => void;
}) {
  const storiesQ = useQuery<Story[]>({
    queryKey: ["/api/groups", group.id, "stories"],
  });
  const storyCount = storiesQ.data?.length ?? 0;

  return (
    <Card data-testid={`card-group-${group.id}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="font-display text-base" data-testid={`text-group-name-${group.id}`}>
            {group.name}
          </CardTitle>
          <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
            {group.schedule ? (
              <Badge variant="secondary" className="font-normal">
                {group.schedule}
              </Badge>
            ) : null}
            {dayName(group.day_of_week) ? (
              <Badge variant="outline" className="font-normal">
                {dayName(group.day_of_week)}
              </Badge>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="mb-1 text-xs text-muted-foreground">
            {group.studentCount} {group.studentCount === 1 ? "student" : "students"}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {group.members.length === 0 ? (
              <span className="text-xs text-muted-foreground">No members yet</span>
            ) : (
              group.members.map((m) => (
                <StudentChip key={m.id} id={m.id} name={m.name} color={m.color} />
              ))
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onManage}
            data-testid={`button-manage-group-${group.id}`}
          >
            <Settings2 className="mr-1 h-4 w-4" />
            Manage
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onGenerate}
            data-testid={`button-generate-group-${group.id}`}
          >
            <Sparkles className="mr-1 h-4 w-4" />
            Generate story
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onManage}
            data-testid={`button-stories-group-${group.id}`}
          >
            <BookOpen className="mr-1 h-4 w-4" />
            Stories ({storyCount})
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function GroupDetailDialog({
  group,
  allStudents,
  allGroups,
  onClose,
}: {
  group: GroupWithMembers;
  allStudents: Student[];
  allGroups: GroupWithMembers[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [addId, setAddId] = useState("");
  const [moveStudent, setMoveStudent] = useState<Student | null>(null);

  const memberIds = new Set(group.members.map((m) => m.id));
  const candidates = allStudents.filter((s) => !memberIds.has(s.id));

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
  };

  const addMember = useMutation({
    mutationFn: async (studentId: number) =>
      apiRequest("POST", `/api/groups/${group.id}/members`, { student_id: studentId }),
    onSuccess: () => {
      invalidate();
      setAddId("");
      toast({ title: "Student added to group" });
    },
    onError: (e: Error) =>
      toast({ title: "Could not add student", description: e.message, variant: "destructive" }),
  });

  const removeMember = useMutation({
    mutationFn: async (studentId: number) =>
      apiRequest("DELETE", `/api/groups/${group.id}/members/${studentId}`),
    onSuccess: () => {
      invalidate();
      toast({ title: "Student removed from group" });
    },
    onError: (e: Error) =>
      toast({ title: "Could not remove student", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">{group.name}</DialogTitle>
          <DialogDescription>
            Manage members, stories, and goal coverage for this group.
          </DialogDescription>
        </DialogHeader>

        {/* Members */}
        <section>
          <h3 className="mb-2 font-display text-sm font-semibold">Members</h3>
          <div className="space-y-2">
            {group.members.length === 0 ? (
              <p className="text-sm text-muted-foreground">No members yet.</p>
            ) : (
              group.members.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between gap-2 rounded-lg border p-2"
                  data-testid={`row-member-${m.id}`}
                >
                  <div className="flex items-center gap-2">
                    <StudentChip id={m.id} name={m.name} color={m.color} variant="badge" />
                    <span className="text-sm font-medium">{m.name}</span>
                    {m.grade ? (
                      <Badge variant="outline" className="font-normal">
                        {m.grade}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setMoveStudent(m)}
                      data-testid={`button-move-${m.id}`}
                    >
                      <ArrowLeftRight className="mr-1 h-4 w-4" />
                      Move…
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeMember.mutate(m.id)}
                      disabled={removeMember.isPending}
                      data-testid={`button-remove-member-${m.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Add student */}
          <div className="mt-3 flex items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <Label>Add student</Label>
              <Select value={addId} onValueChange={setAddId}>
                <SelectTrigger data-testid="select-add-student">
                  <SelectValue placeholder="Choose a student…" />
                </SelectTrigger>
                <SelectContent>
                  {candidates.length === 0 ? (
                    <SelectItem value="__none" disabled>
                      All students already in group
                    </SelectItem>
                  ) : (
                    candidates.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => addId && addMember.mutate(Number(addId))}
              disabled={!addId || addMember.isPending}
              data-testid="button-add-member"
            >
              <UserPlus className="mr-1 h-4 w-4" />
              Add
            </Button>
          </div>
        </section>

        <Separator />

        {/* Stories */}
        <GroupStories groupId={group.id} />

        <Separator />

        {/* Coverage */}
        <GroupCoverage groupId={group.id} />
      </DialogContent>

      {moveStudent && (
        <MoveStudentDialog
          student={moveStudent}
          fromGroup={group}
          allGroups={allGroups}
          onClose={() => setMoveStudent(null)}
        />
      )}
    </Dialog>
  );
}

function MoveStudentDialog({
  student,
  fromGroup,
  allGroups,
  onClose,
}: {
  student: Student;
  fromGroup: GroupWithMembers;
  allGroups: GroupWithMembers[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [target, setTarget] = useState("");
  const [keep, setKeep] = useState(false);

  const others = allGroups.filter((g) => g.id !== fromGroup.id);

  const move = useMutation({
    mutationFn: async () => {
      const body: { to_group_id: number; from_group_id?: number } = {
        to_group_id: Number(target),
      };
      if (!keep) body.from_group_id = fromGroup.id;
      return apiRequest("POST", `/api/students/${student.id}/move`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      toast({
        title: keep ? "Student added to group" : "Student moved",
      });
      onClose();
    },
    onError: (e: Error) =>
      toast({ title: "Could not move student", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">Move {student.name}</DialogTitle>
          <DialogDescription>
            Switch this student to another group, or add them to it as well.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Target group</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger data-testid="select-move-target">
                <SelectValue placeholder="Choose a group…" />
              </SelectTrigger>
              <SelectContent>
                {others.length === 0 ? (
                  <SelectItem value="__none" disabled>
                    No other groups available
                  </SelectItem>
                ) : (
                  others.map((g) => (
                    <SelectItem key={g.id} value={String(g.id)}>
                      {g.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="keep-current"
              checked={keep}
              onCheckedChange={(c) => setKeep(c === true)}
              data-testid="checkbox-keep-current"
            />
            <Label htmlFor="keep-current" className="text-sm font-normal">
              Also keep in {fromGroup.name}
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() => move.mutate()}
            disabled={!target || move.isPending}
            data-testid="button-confirm-move"
          >
            {move.isPending ? "Moving…" : keep ? "Add to group" : "Move student"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GroupStories({ groupId }: { groupId: number }) {
  const { toast } = useToast();
  const storiesQ = useQuery<Story[]>({
    queryKey: ["/api/groups", groupId, "stories"],
  });
  const stories = storiesQ.data ?? [];
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const approve = useMutation({
    mutationFn: async (id: number) =>
      apiRequest("PATCH", `/api/stories/${id}`, { status: "approved" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "stories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stories"] });
      toast({ title: "Story approved" });
    },
    onError: (e: Error) =>
      toast({ title: "Could not approve", description: e.message, variant: "destructive" }),
  });

  const del = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/stories/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "stories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stories"] });
      setDeleteId(null);
      toast({ title: "Story deleted" });
    },
    onError: (e: Error) =>
      toast({ title: "Could not delete", description: e.message, variant: "destructive" }),
  });

  return (
    <section>
      <h3 className="mb-2 font-display text-sm font-semibold">Stories</h3>
      {storiesQ.isLoading ? (
        <Skeleton className="h-16 rounded-lg" />
      ) : stories.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No stories yet — generate one above.
        </p>
      ) : (
        <div className="space-y-2">
          {stories.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between gap-2 rounded-lg border p-2"
              data-testid={`row-story-${s.id}`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{s.title}</span>
                  <StatusBadge status={s.status} />
                </div>
                <div className="text-xs text-muted-foreground">
                  {s.est_minutes} min · {s.beats.length} scenes ·{" "}
                  {s.stop_points.length} stop-points
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <Link href="/stories">
                  <Button variant="ghost" size="sm" data-testid={`button-preview-story-${s.id}`}>
                    <Eye className="h-4 w-4" />
                  </Button>
                </Link>
                {s.status === "draft" ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => approve.mutate(s.id)}
                    disabled={approve.isPending}
                    data-testid={`button-approve-story-${s.id}`}
                  >
                    <Check className="mr-1 h-4 w-4" />
                    Approve
                  </Button>
                ) : (
                  <Link href={`/session/${s.id}`}>
                    <Button size="sm" data-testid={`button-run-story-${s.id}`}>
                      <Play className="mr-1 h-4 w-4" />
                      Run
                    </Button>
                  </Link>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setDeleteId(s.id)}
                  data-testid={`button-delete-story-${s.id}`}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this story?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the story. Past sessions are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-story">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && del.mutate(deleteId)}
              data-testid="button-confirm-delete-story"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function GroupCoverage({ groupId }: { groupId: number }) {
  const coverageQ = useQuery<GoalCoverage[]>({
    queryKey: ["/api/groups", groupId, "coverage"],
  });
  const rows = [...(coverageQ.data ?? [])].sort((a, b) => {
    // least-targeted first: nulls (no trials) on top, then lower trial counts
    if (a.total_trials === 0 && b.total_trials !== 0) return -1;
    if (b.total_trials === 0 && a.total_trials !== 0) return 1;
    return a.total_trials - b.total_trials;
  });

  return (
    <section>
      <h3 className="mb-2 font-display text-sm font-semibold">
        Goal coverage{" "}
        <span className="font-normal text-muted-foreground">
          (least-targeted first)
        </span>
      </h3>
      {coverageQ.isLoading ? (
        <Skeleton className="h-24 rounded-lg" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No active goals among current members.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Goal</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Accuracy</TableHead>
                <TableHead className="text-right">Last session</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.goal_id} data-testid={`row-coverage-${r.goal_id}`}>
                  <TableCell>
                    <StudentChip name={r.student_name} color={chipColorFor(r)} variant="dot" />
                  </TableCell>
                  <TableCell className="font-medium">{r.label}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {goalTypeLabel(r.goal_type)}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.accuracy === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span data-testid={`text-accuracy-${r.goal_id}`}>{r.accuracy}%</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {formatDate(r.last_session_date)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}

// coverage rows don't carry the hex color; fall back to a neutral teal dot
function chipColorFor(_r: GoalCoverage): string {
  return "#0E9594";
}

function GenerateDialog({
  group,
  onClose,
}: {
  group: GroupWithMembers;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [theme, setTheme] = useState("");

  const generate = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/stories/generate", {
        group_id: group.id,
        theme: theme || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups", group.id, "stories"] });
      toast({ title: "Draft story created — preview and approve it." });
      onClose();
    },
    onError: (e: Error) => {
      if (e.message.startsWith("503")) {
        toast({
          title: "Story generation unavailable",
          description:
            "Story generation runs in the authoring environment. Ask your StorySLP author to generate this story.",
        });
      } else {
        toast({
          title: "Could not generate story",
          description: e.message,
          variant: "destructive",
        });
      }
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">Generate story</DialogTitle>
          <DialogDescription>
            One story for <strong>{group.name}</strong> that combines every active
            goal of its {group.studentCount} members.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="theme">Theme (optional)</Label>
          <Input
            id="theme"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            placeholder="e.g. a trip to the tide pools"
            data-testid="input-theme"
          />
        </div>
        <DialogFooter>
          <Button
            onClick={() => generate.mutate()}
            disabled={generate.isPending}
            data-testid="button-confirm-generate"
          >
            <Sparkles className="mr-1 h-4 w-4" />
            {generate.isPending ? "Generating…" : "Generate draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function StatusBadge({ status }: { status: "draft" | "approved" }) {
  if (status === "approved") {
    return (
      <Badge className="bg-primary text-primary-foreground" data-testid="badge-status-approved">
        Approved
      </Badge>
    );
  }
  return (
    <Badge
      className="border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-400"
      variant="outline"
      data-testid="badge-status-draft"
    >
      Draft
    </Badge>
  );
}
