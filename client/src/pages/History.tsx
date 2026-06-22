import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { History as HistoryIcon, Download, Eye } from "lucide-react";
import type {
  Session,
  GroupWithMembers,
  Story,
  GoalLog,
  Student,
} from "@shared/schema";
import { AppShell } from "@/components/AppShell";
import { StudentChip } from "@/components/StudentChip";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { formatDate, getJSON } from "@/lib/storyslp";

type SessionWithLogs = Session & { logs: GoalLog[] };

export default function History() {
  const { toast } = useToast();
  const sessionsQ = useQuery<Session[]>({ queryKey: ["/api/sessions"] });
  const groupsQ = useQuery<GroupWithMembers[]>({ queryKey: ["/api/groups"] });
  const storiesQ = useQuery<Story[]>({ queryKey: ["/api/stories"] });
  const studentsQ = useQuery<Student[]>({ queryKey: ["/api/students"] });

  const sessions = [...(sessionsQ.data ?? [])].sort((a, b) => b.id - a.id);
  const groups = groupsQ.data ?? [];
  const stories = storiesQ.data ?? [];
  const students = studentsQ.data ?? [];

  const groupName = (id: number) =>
    groups.find((g) => g.id === id)?.name ?? `Group ${id}`;
  const storyTitle = (id: number) =>
    stories.find((s) => s.id === id)?.title ?? `Story ${id}`;

  const [detailId, setDetailId] = useState<number | null>(null);

  const backup = useMutation({
    mutationFn: async () => {
      const [students, groups, stories, sessions] = await Promise.all([
        getJSON<Student[]>("/api/students"),
        getJSON<GroupWithMembers[]>("/api/groups"),
        getJSON<Story[]>("/api/stories"),
        getJSON<Session[]>("/api/sessions"),
      ]);
      return { exported_at: new Date().toISOString(), students, groups, stories, sessions };
    },
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const date = new Date().toISOString().slice(0, 10);
      a.download = `storyslp-backup-${date}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Backup downloaded" });
    },
    onError: (e: Error) =>
      toast({ title: "Backup failed", description: e.message, variant: "destructive" }),
  });

  return (
    <AppShell>
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <HistoryIcon className="h-6 w-6 text-primary" />
          <h1 className="font-display text-xl font-bold">History</h1>
        </div>
        <Button
          variant="outline"
          onClick={() => backup.mutate()}
          disabled={backup.isPending}
          data-testid="button-backup-json"
        >
          <Download className="mr-1 h-4 w-4" />
          {backup.isPending ? "Preparing…" : "Backup (JSON)"}
        </Button>
      </div>

      {sessionsQ.isLoading ? (
        <Skeleton className="h-48 rounded-xl" />
      ) : sessions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <HistoryIcon className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No sessions logged yet. Run a story to record results here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Group</TableHead>
                    <TableHead>Story</TableHead>
                    <TableHead className="text-right">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.map((s) => (
                    <TableRow key={s.id} data-testid={`row-session-${s.id}`}>
                      <TableCell data-testid={`text-session-date-${s.id}`}>
                        {formatDate(s.date)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-normal">
                          {groupName(s.group_id)}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        {storyTitle(s.story_id)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDetailId(s.id)}
                          data-testid={`button-view-session-${s.id}`}
                        >
                          <Eye className="mr-1 h-4 w-4" />
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {detailId !== null && (
        <SessionDetail
          sessionId={detailId}
          students={students}
          groupName={groupName}
          storyTitle={storyTitle}
          onClose={() => setDetailId(null)}
        />
      )}
    </AppShell>
  );
}

function SessionDetail({
  sessionId,
  students,
  groupName,
  storyTitle,
  onClose,
}: {
  sessionId: number;
  students: Student[];
  groupName: (id: number) => string;
  storyTitle: (id: number) => string;
  onClose: () => void;
}) {
  const detailQ = useQuery<SessionWithLogs>({
    queryKey: ["/api/sessions", sessionId],
    queryFn: () => getJSON<SessionWithLogs>(`/api/sessions/${sessionId}`),
  });
  const studentById = new Map(students.map((s) => [s.id, s]));
  const session = detailQ.data;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">
            {session ? storyTitle(session.story_id) : "Session"}
          </DialogTitle>
          <DialogDescription>
            {session
              ? `${groupName(session.group_id)} · ${formatDate(session.date)}`
              : "Loading session…"}
          </DialogDescription>
        </DialogHeader>

        {detailQ.isLoading ? (
          <Skeleton className="h-32 rounded-lg" />
        ) : !session || session.logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No goal logs for this session.</p>
        ) : (
          <div className="space-y-2">
            {session.notes ? (
              <div className="rounded-lg bg-muted/40 p-3 text-sm">
                <span className="font-semibold">Notes:</span> {session.notes}
              </div>
            ) : null}
            {session.logs.map((log) => {
              const st = studentById.get(log.student_id);
              const acc =
                log.trials > 0 ? Math.round((log.correct / log.trials) * 100) : null;
              return (
                <div
                  key={log.id}
                  className="flex items-center justify-between gap-2 rounded-lg border p-2 text-sm"
                  data-testid={`row-log-${log.id}`}
                >
                  <div className="flex items-center gap-2">
                    <StudentChip
                      id={st?.id}
                      name={st?.name ?? `Student ${log.student_id}`}
                      color={st?.color ?? "#0E9594"}
                      variant="dot"
                    />
                    <span className="text-xs text-muted-foreground">
                      Goal #{log.goal_id}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {log.prompted > 0 && (
                      <Badge variant="secondary" className="font-normal">
                        {log.prompted} prompted
                      </Badge>
                    )}
                    <span className="font-medium">
                      {log.correct}/{log.trials}
                      {acc !== null ? ` · ${acc}%` : ""}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
