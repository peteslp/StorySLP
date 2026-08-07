import { useMemo, useRef, useState } from "react";
import { Link, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  X,
  Check,
  ChevronRight,
  Save,
  PartyPopper,
  CheckCircle2,
  Volume2,
  Play,
  Pause,
  Loader2,
  Images,
} from "lucide-react";
import type { Story, Student, StopPoint, ComicPanel } from "@shared/schema";
import { useComic } from "@/lib/useComic";
import { StudentChip } from "@/components/StudentChip";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { goalTypeLabel, getJSON } from "@/lib/storyslp";

export default function RunSession() {
  const params = useParams();
  const storyId = Number(params.storyId);

  const storyQ = useQuery<Story>({
    queryKey: ["/api/stories", storyId],
    queryFn: () => getJSON<Story>(`/api/stories/${storyId}`),
  });
  const studentsQ = useQuery<Student[]>({ queryKey: ["/api/students"] });

  const story = storyQ.data;
  const students = studentsQ.data ?? [];

  if (storyQ.isLoading || studentsQ.isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Skeleton className="mb-4 h-12 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (storyQ.isError || !story) {
    return (
      <Centered>
        <p className="text-sm text-muted-foreground" data-testid="text-story-error">
          Could not load this story.
        </p>
        <Link href="/stories">
          <Button variant="outline" data-testid="button-back-library">
            Back to Story Library
          </Button>
        </Link>
      </Centered>
    );
  }

  if (story.status !== "approved") {
    return <DraftNotice story={story} />;
  }

  return <Runner story={story} students={students} />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      {children}
    </div>
  );
}

function DraftNotice({ story }: { story: Story }) {
  const { toast } = useToast();
  const approve = useMutation({
    mutationFn: async () =>
      apiRequest("PATCH", `/api/stories/${story.id}`, { status: "approved" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stories", story.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/stories"] });
      toast({ title: "Story approved — you can run it now." });
    },
    onError: (e: Error) =>
      toast({ title: "Could not approve", description: e.message, variant: "destructive" }),
  });

  return (
    <Centered>
      <h1 className="font-display text-xl font-bold">{story.title}</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        This story is still a draft. Approve it to run a session.
      </p>
      <div className="flex gap-2">
        <Button
          onClick={() => approve.mutate()}
          disabled={approve.isPending}
          data-testid="button-approve-draft"
        >
          <Check className="mr-1 h-4 w-4" />
          {approve.isPending ? "Approving…" : "Approve story"}
        </Button>
        <Link href="/stories">
          <Button variant="outline" data-testid="button-quit-draft">
            Story Library
          </Button>
        </Link>
      </div>
    </Centered>
  );
}

function Runner({ story, students }: { story: Story; students: Student[] }) {
  const { toast } = useToast();
  const studentById = useMemo(
    () => new Map(students.map((s) => [s.id, s])),
    [students],
  );

  const beats = story.beats;
  const totalBeats = beats.length;

  // Comic strip: panels keyed by beat id, split into left/right rails.
  const comic = useComic(story.id, story.images?.panels ?? []);
  const panelByBeat = useMemo(() => {
    const m = new Map<string, ComicPanel>();
    comic.panels.forEach((p) => m.set(p.beatId, p));
    return m;
  }, [comic.panels]);
  const orderedPanels = useMemo(
    () => beats.map((b) => panelByBeat.get(b.id)).filter(Boolean) as ComicPanel[],
    [beats, panelByBeat],
  );
  const leftPanels = orderedPanels.filter((_, i) => i % 2 === 0);
  const rightPanels = orderedPanels.filter((_, i) => i % 2 === 1);

  // Build an ordered list of (beatIndex, stopPoint) so we can step through them.
  const steps = useMemo(() => {
    const out: { beatIndex: number; stop: StopPoint }[] = [];
    beats.forEach((beat, bi) => {
      story.stop_points
        .filter((sp) => sp.afterBeatId === beat.id)
        .forEach((sp) => out.push({ beatIndex: bi, stop: sp }));
    });
    return out;
  }, [beats, story.stop_points]);

  // step index into `steps`; when >= steps.length we're at the summary
  const [stepIdx, setStepIdx] = useState(0);
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState(false);

  const atSummary = stepIdx >= steps.length;
  const current = atSummary ? null : steps[stepIdx];
  const currentBeat = current ? beats[current.beatIndex] : null;

  const save = useMutation({
    mutationFn: async () => {
      const sres = await apiRequest("POST", "/api/sessions", {
        group_id: story.group_id,
        story_id: story.id,
        notes: notes || undefined,
      });
      const session = (await sres.json()) as { id: number };
      return session;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/groups", story.group_id, "sessions"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/groups", story.group_id, "coverage"],
      });
      setSaved(true);
      toast({ title: "Session saved" });
    },
    onError: (e: Error) =>
      toast({ title: "Could not save session", description: e.message, variant: "destructive" }),
  });

  const progressBeat = atSummary
    ? totalBeats
    : (current?.beatIndex ?? 0) + 1;

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <div className="sticky top-0 z-20 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <div className="truncate font-display text-sm font-bold" data-testid="text-runner-title">
              {story.title}
            </div>
            <div className="text-xs text-muted-foreground" data-testid="text-runner-progress">
              {atSummary ? "Summary" : `Scene ${progressBeat} of ${totalBeats}`}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <ComicControl
              comic={comic}
              hasPanels={orderedPanels.length > 0}
              totalBeats={totalBeats}
            />
            <SessionNarration story={story} />
            <Link href="/stories">
              <Button variant="ghost" size="sm" data-testid="button-quit-session">
                <X className="mr-1 h-4 w-4" />
                Quit
              </Button>
            </Link>
          </div>
        </div>
        <Progress
          value={atSummary ? 100 : (progressBeat / Math.max(totalBeats, 1)) * 100}
          className="h-1 rounded-none"
        />
      </div>

      {/* Comic rails in the side margins (wide screens only) */}
      {orderedPanels.length > 0 && (
        <>
          <ComicRail
            side="left"
            panels={leftPanels}
            activeBeatId={currentBeat?.id}
          />
          <ComicRail
            side="right"
            panels={rightPanels}
            activeBeatId={currentBeat?.id}
          />
        </>
      )}

      <div className="mx-auto max-w-3xl px-4 py-8">
        {atSummary ? (
          <Summary
            notes={notes}
            setNotes={setNotes}
            onSave={() => save.mutate()}
            saving={save.isPending}
            saved={saved}
          />
        ) : (
          current &&
          currentBeat && (
            <div className="space-y-6">
              {/* Beat text + inline comic panel (visible on all screen sizes) */}
              <div>
                <div className="mb-1 font-mono text-xs font-semibold uppercase tracking-wider text-primary">
                  Scene {current.beatIndex + 1} of {totalBeats}
                </div>
                {panelByBeat.get(currentBeat.id) ? (
                  <img
                    src={panelByBeat.get(currentBeat.id)!.url}
                    alt=""
                    className="mb-4 w-full max-w-sm rounded-lg border-2 border-border bg-card object-cover shadow-sm xl:hidden"
                    data-testid={`comic-panel-inline-${currentBeat.id}`}
                  />
                ) : null}
                <p
                  className="font-display text-lg leading-relaxed text-foreground"
                  data-testid="text-beat"
                >
                  {currentBeat.text}
                </p>
              </div>

              {/* Stop-point */}
              <StopPointRunner
                key={current.stop.id}
                stop={current.stop}
                student={studentById.get(current.stop.studentId)}
              />

              <div className="flex justify-end">
                <Button
                  size="lg"
                  onClick={() => setStepIdx((i) => i + 1)}
                  data-testid="button-next"
                >
                  {stepIdx === steps.length - 1 ? "Finish" : "Next"}
                  <ChevronRight className="ml-1 h-5 w-5" />
                </Button>
              </div>
            </div>
          )
        )}

        {/* No stop-points edge case */}
        {!atSummary && steps.length === 0 && (
          <Centered>
            <p className="text-sm text-muted-foreground">
              This story has no stop-points.
            </p>
            <Link href="/stories">
              <Button variant="outline">Back to Story Library</Button>
            </Link>
          </Centered>
        )}
      </div>
    </div>
  );
}

// Compact narration control for the session top bar.
// If audio exists, shows play/pause. Otherwise a one-tap "Narrate" button that
// generates HD voice on the fly, then auto-plays.
function SessionNarration({ story }: { story: Story }) {
  const { toast } = useToast();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [localUrl, setLocalUrl] = useState<string | undefined>(
    story.audio_status === "ready" ? story.audio?.url : undefined,
  );

  const generate = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/stories/${story.id}/audio`, {});
      return (await res.json()) as Story;
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["/api/stories"] });
      const url = updated.audio?.url;
      if (url) {
        setLocalUrl(url);
        // wait a tick for the <audio> src to mount, then play
        setTimeout(() => audioRef.current?.play().catch(() => {}), 50);
      }
    },
    onError: (e: Error) => {
      if (e.message.startsWith("503")) {
        toast({
          title: "Narration unavailable",
          description: "The OpenAI key isn't configured on the server yet.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Could not generate narration", description: e.message, variant: "destructive" });
      }
    },
  });

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => {});
    else el.pause();
  };

  if (!localUrl) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => generate.mutate()}
        disabled={generate.isPending}
        data-testid="button-session-narrate"
      >
        {generate.isPending ? (
          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
        ) : (
          <Volume2 className="mr-1 h-4 w-4" />
        )}
        {generate.isPending ? "Preparing…" : "Narrate"}
      </Button>
    );
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={toggle}
        data-testid="button-session-play"
      >
        {playing ? <Pause className="mr-1 h-4 w-4" /> : <Play className="mr-1 h-4 w-4" />}
        {playing ? "Pause" : "Narrate"}
      </Button>
      <audio
        ref={audioRef}
        src={localUrl}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        data-testid="session-audio"
      />
    </>
  );
}

// Top-bar button that triggers comic generation and shows live batch progress.
function ComicControl({
  comic,
  hasPanels,
  totalBeats,
}: {
  comic: ReturnType<typeof useComic>;
  hasPanels: boolean;
  totalBeats: number;
}) {
  const { toast } = useToast();

  const run = async () => {
    await comic.generate();
  };

  // Surface a friendly message if the key is missing (503) or another error.
  if (comic.error) {
    const friendly = comic.error.startsWith("503")
      ? "The OpenAI key isn't configured on the server yet."
      : comic.error;
    toast({
      title: "Comic unavailable",
      description: friendly,
      variant: "destructive",
    });
  }

  if (comic.generating) {
    const done = comic.progress?.completed ?? 0;
    const total = comic.progress?.total ?? totalBeats;
    return (
      <Button variant="ghost" size="sm" disabled data-testid="button-session-comic">
        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
        {`Comic ${done}/${total}`}
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={run}
      data-testid="button-session-comic"
    >
      <Images className="mr-1 h-4 w-4" />
      {hasPanels ? "Redraw" : "Comic"}
    </Button>
  );
}

// A fixed vertical strip of comic panels pinned to one side margin.
// Center column is max-w-3xl (768px), so rails only have room on xl+ screens.
function ComicRail({
  side,
  panels,
  activeBeatId,
}: {
  side: "left" | "right";
  panels: ComicPanel[];
  activeBeatId?: string;
}) {
  if (panels.length === 0) return null;
  return (
    <div
      className={`fixed ${side === "left" ? "left-4" : "right-4"} top-16 bottom-0 z-10 hidden w-44 flex-col gap-3 overflow-y-auto py-4 xl:flex`}
      data-testid={`comic-rail-${side}`}
      aria-hidden="true"
    >
      {panels.map((p) => {
        const active = p.beatId === activeBeatId;
        return (
          <img
            key={p.beatId}
            src={p.url}
            alt=""
            loading="lazy"
            className={`w-full rounded-lg border-2 bg-card object-cover shadow-sm transition-all ${
              active
                ? "border-primary ring-2 ring-primary/40 scale-[1.02]"
                : "border-border opacity-80"
            }`}
            data-testid={`comic-panel-${p.beatId}`}
          />
        );
      })}
    </div>
  );
}

function StopPointRunner({
  stop,
  student,
}: {
  stop: StopPoint;
  student: Student | undefined;
}) {
  return (
    <Card data-testid={`stop-runner-${stop.id}`}>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <StudentChip
            id={student?.id}
            name={student?.name ?? `Student ${stop.studentId}`}
            color={student?.color ?? "#0E9594"}
            variant="pill"
          />
          <Badge variant="outline" className="font-normal">
            {goalTypeLabel(stop.goalType)}
          </Badge>
        </div>

        <p className="font-display text-lg font-semibold text-foreground" data-testid="text-question">
          {stop.question}
        </p>

        {stop.responseType === "choice" && stop.choices && stop.choices.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {stop.choices.map((c, i) => (
              <Button
                key={i}
                variant="outline"
                className="rounded-full"
                data-testid={`button-choice-${i}`}
              >
                {c}
              </Button>
            ))}
          </div>
        )}

        {/* Clinician view (default open) */}
        <Collapsible defaultOpen>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-0 text-xs text-primary"
              data-testid="button-clinician-view"
            >
              Clinician view
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 space-y-1 rounded-lg bg-muted/40 p-3 text-sm">
              <p>
                <span className="font-semibold">Target response:</span>{" "}
                {stop.targetResponse}
              </p>
              {stop.teachingNote ? (
                <p className="text-muted-foreground">
                  <span className="font-semibold text-foreground">Teaching note:</span>{" "}
                  {stop.teachingNote}
                </p>
              ) : null}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}

function Summary({
  notes,
  setNotes,
  onSave,
  saving,
  saved,
}: {
  notes: string;
  setNotes: (v: string) => void;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <PartyPopper className="h-6 w-6 text-accent" />
        <h1 className="font-display text-xl font-bold">Session complete</h1>
      </div>

      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          Great work — add any notes below and save the session.
        </CardContent>
      </Card>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Session notes (optional)</label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Observations, accuracy tallies, follow-ups, behavior notes…"
          data-testid="input-session-notes"
          disabled={saved}
          rows={5}
        />
      </div>

      {saved ? (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle2 className="h-8 w-8 text-primary" />
            <p className="font-display font-semibold">Session saved</p>
            <div className="flex gap-2">
              <Link href="/history">
                <Button data-testid="button-go-history">View in History</Button>
              </Link>
              <Link href="/stories">
                <Button variant="outline" data-testid="button-back-stories">
                  Story Library
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Button
          size="lg"
          className="w-full"
          onClick={onSave}
          disabled={saving}
          data-testid="button-save-session"
        >
          <Save className="mr-1 h-5 w-5" />
          {saving ? "Saving…" : "Save session"}
        </Button>
      )}
    </div>
  );
}
