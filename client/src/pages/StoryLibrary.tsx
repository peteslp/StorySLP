import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  BookOpen,
  Sparkles,
  Eye,
  Check,
  Play,
  Trash2,
  Clock,
  ListOrdered,
  MapPin,
  UsersRound,
} from "lucide-react";
import type { Story, GroupWithMembers, Student } from "@shared/schema";
import { AppShell } from "@/components/AppShell";
import { StudentChip } from "@/components/StudentChip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { goalTypeLabel } from "@/lib/storyslp";
import { StatusBadge } from "@/pages/Groups";

export default function StoryLibrary() {
  const { toast } = useToast();
  const storiesQ = useQuery<Story[]>({ queryKey: ["/api/stories"] });
  const groupsQ = useQuery<GroupWithMembers[]>({ queryKey: ["/api/groups"] });
  const studentsQ = useQuery<Student[]>({ queryKey: ["/api/students"] });

  const stories = storiesQ.data ?? [];
  const groups = groupsQ.data ?? [];
  const students = studentsQ.data ?? [];

  const groupName = (id: number) =>
    groups.find((g) => g.id === id)?.name ?? `Group ${id}`;

  const [previewStory, setPreviewStory] = useState<Story | null>(null);
  const [deleteStory, setDeleteStory] = useState<Story | null>(null);

  // generate controls
  const [genGroup, setGenGroup] = useState("");
  const [theme, setTheme] = useState("");

  const approve = useMutation({
    mutationFn: async (id: number) =>
      apiRequest("PATCH", `/api/stories/${id}`, { status: "approved" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stories"] });
      toast({ title: "Story approved" });
    },
    onError: (e: Error) =>
      toast({ title: "Could not approve", description: e.message, variant: "destructive" }),
  });

  const del = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/stories/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stories"] });
      setDeleteStory(null);
      toast({ title: "Story deleted" });
    },
    onError: (e: Error) =>
      toast({ title: "Could not delete", description: e.message, variant: "destructive" }),
  });

  const generate = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/stories/generate", {
        group_id: Number(genGroup),
        theme: theme || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stories"] });
      setTheme("");
      toast({ title: "Draft story created — preview and approve it." });
    },
    onError: (e: Error) => {
      if (e.message.startsWith("503")) {
        toast({
          title: "Story generation unavailable",
          description:
            "Story generation runs in the authoring environment. Ask your StorySLP author to generate this story.",
        });
      } else {
        toast({ title: "Could not generate story", description: e.message, variant: "destructive" });
      }
    },
  });

  // group stories by group
  const byGroup = new Map<number, Story[]>();
  for (const s of stories) {
    if (!byGroup.has(s.group_id)) byGroup.set(s.group_id, []);
    byGroup.get(s.group_id)!.push(s);
  }
  const groupIds = Array.from(byGroup.keys()).sort(
    (a, b) => groupName(a).localeCompare(groupName(b)),
  );

  return (
    <AppShell>
      <div className="mb-6 flex items-center gap-2">
        <BookOpen className="h-6 w-6 text-primary" />
        <h1 className="font-display text-xl font-bold">Story Library</h1>
      </div>

      {/* Generate control */}
      <Card className="mb-6">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label>Group</Label>
            <Select value={genGroup} onValueChange={setGenGroup}>
              <SelectTrigger data-testid="select-generate-group">
                <SelectValue placeholder="Choose a group…" />
              </SelectTrigger>
              <SelectContent>
                {groups.length === 0 ? (
                  <SelectItem value="__none" disabled>
                    No groups yet
                  </SelectItem>
                ) : (
                  groups.map((g) => (
                    <SelectItem key={g.id} value={String(g.id)}>
                      {g.name} ({g.studentCount})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="lib-theme">Theme (optional)</Label>
            <Input
              id="lib-theme"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              placeholder="e.g. a trip to the tide pools"
              data-testid="input-generate-theme"
            />
          </div>
          <Button
            onClick={() => generate.mutate()}
            disabled={!genGroup || generate.isPending}
            data-testid="button-generate-story"
          >
            <Sparkles className="mr-1 h-4 w-4" />
            {generate.isPending ? "Generating…" : "Generate story"}
          </Button>
        </CardContent>
      </Card>

      {storiesQ.isLoading ? (
        <div className="space-y-4">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : stories.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <BookOpen className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No stories yet. Generate one for a group above.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {groupIds.map((gid) => (
            <section key={gid}>
              <h2 className="mb-3 font-display text-lg font-semibold">
                {groupName(gid)}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {byGroup.get(gid)!.map((s) => {
                  const targetCount = new Set(
                    s.stop_points.map((sp) => sp.studentId),
                  ).size;
                  return (
                    <Card key={s.id} data-testid={`card-story-${s.id}`}>
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between gap-2">
                          <CardTitle
                            className="font-display text-base"
                            data-testid={`text-story-title-${s.id}`}
                          >
                            {s.title}
                          </CardTitle>
                          <StatusBadge status={s.status} />
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" /> {s.est_minutes} min
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <ListOrdered className="h-3.5 w-3.5" /> {s.beats.length} scenes
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" /> {s.stop_points.length} stop-points
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <UsersRound className="h-3.5 w-3.5" /> {targetCount} students
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPreviewStory(s)}
                            data-testid={`button-preview-${s.id}`}
                          >
                            <Eye className="mr-1 h-4 w-4" />
                            Preview
                          </Button>
                          {s.status === "draft" ? (
                            <Button
                              size="sm"
                              onClick={() => approve.mutate(s.id)}
                              disabled={approve.isPending}
                              data-testid={`button-approve-${s.id}`}
                            >
                              <Check className="mr-1 h-4 w-4" />
                              Approve
                            </Button>
                          ) : (
                            <Link href={`/session/${s.id}`}>
                              <Button size="sm" data-testid={`button-run-${s.id}`}>
                                <Play className="mr-1 h-4 w-4" />
                                Run
                              </Button>
                            </Link>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteStory(s)}
                            data-testid={`button-delete-${s.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {previewStory && (
        <StoryPreviewDialog
          story={previewStory}
          students={students}
          onClose={() => setPreviewStory(null)}
        />
      )}

      <AlertDialog open={deleteStory !== null} onOpenChange={(o) => !o && setDeleteStory(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{deleteStory?.title}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the story. Past sessions are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteStory && del.mutate(deleteStory.id)}
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

export function StoryPreviewDialog({
  story,
  students,
  onClose,
}: {
  story: Story;
  students: Student[];
  onClose: () => void;
}) {
  const studentById = new Map(students.map((s) => [s.id, s]));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">{story.title}</DialogTitle>
          <DialogDescription>
            {story.est_minutes} min · {story.beats.length} scenes ·{" "}
            {story.stop_points.length} stop-points
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {story.beats.map((beat, idx) => {
            const stops = story.stop_points.filter((sp) => sp.afterBeatId === beat.id);
            return (
              <div key={beat.id} data-testid={`preview-beat-${beat.id}`}>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">
                  Scene {idx + 1}
                </div>
                <p className="text-sm leading-relaxed text-foreground">{beat.text}</p>
                {stops.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {stops.map((sp) => {
                      const st = studentById.get(sp.studentId);
                      return (
                        <StopPointCard
                          key={sp.id}
                          stop={sp}
                          studentName={st?.name ?? `Student ${sp.studentId}`}
                          studentColor={st?.color ?? "#0E9594"}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <DialogFooter>
          {story.status === "approved" ? (
            <Link href={`/session/${story.id}`}>
              <Button data-testid="button-preview-run">
                <Play className="mr-1 h-4 w-4" />
                Run session
              </Button>
            </Link>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StopPointCard({
  stop,
  studentName,
  studentColor,
}: {
  stop: import("@shared/schema").StopPoint;
  studentName: string;
  studentColor: string;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3" data-testid={`preview-stop-${stop.id}`}>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <StudentChip name={studentName} color={studentColor} variant="pill" />
        <Badge variant="outline" className="font-normal">
          {goalTypeLabel(stop.goalType)}
        </Badge>
      </div>
      <p className="text-sm font-medium text-foreground">{stop.question}</p>
      {stop.responseType === "choice" && stop.choices && stop.choices.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {stop.choices.map((c, i) => (
            <Badge key={i} variant="secondary" className="font-normal">
              {c}
            </Badge>
          ))}
        </div>
      )}
      <div className="mt-2 text-xs text-muted-foreground">
        <span className="font-semibold">Target:</span> {stop.targetResponse}
      </div>
      {stop.teachingNote ? (
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="mt-1 h-auto p-0 text-xs text-primary"
              data-testid={`button-teaching-note-${stop.id}`}
            >
              Teaching note
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <p className="mt-1 text-xs text-muted-foreground">{stop.teachingNote}</p>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  );
}
