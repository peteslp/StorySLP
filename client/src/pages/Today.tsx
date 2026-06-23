import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  CalendarCheck,
  Users,
  GraduationCap,
  BookOpen,
  Play,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import type { GroupWithMembers, Student, Story } from "@shared/schema";
import { AppShell } from "@/components/AppShell";
import { StudentChip } from "@/components/StudentChip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { dayName } from "@/lib/storyslp";

export default function Today() {
  const today = new Date().getDay();

  const groupsQ = useQuery<GroupWithMembers[]>({ queryKey: ["/api/groups"] });
  const studentsQ = useQuery<Student[]>({ queryKey: ["/api/students"] });
  const storiesQ = useQuery<Story[]>({ queryKey: ["/api/stories"] });

  const groups = groupsQ.data ?? [];
  const stories = storiesQ.data ?? [];
  const students = studentsQ.data ?? [];

  const scheduled = groups.filter((g) => g.day_of_week === today);
  const approvedStories = stories.filter((s) => s.status === "approved");

  // newest approved story per group (highest id)
  const latestApprovedFor = (groupId: number): Story | undefined =>
    approvedStories
      .filter((s) => s.group_id === groupId)
      .sort((a, b) => b.id - a.id)[0];

  const loading = groupsQ.isLoading;

  return (
    <AppShell>
      {/* Hero */}
      <section className="mb-8 rounded-xl border bg-card p-6 md:p-8">
        <div className="flex items-center gap-2 text-primary">
          <Sparkles className="h-5 w-5" />
          <span className="font-mono text-xs font-semibold uppercase tracking-wider">
            StorySLP
          </span>
        </div>
        <h1
          className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground"
          data-testid="text-hero-title"
        >
          One story. <span className="text-primary">Every goal.</span>
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Pick a group scheduled today and run its story scene by scene — every
          student&apos;s IEP goals are woven into one shared narrative.
        </p>
      </section>

      {/* At a glance */}
      <section className="mb-8 grid grid-cols-3 gap-3">
        <StatCard
          label="Students"
          value={studentsQ.isLoading ? null : students.length}
          icon={<GraduationCap className="h-4 w-4" />}
          testid="stat-students"
        />
        <StatCard
          label="Groups"
          value={groupsQ.isLoading ? null : groups.length}
          icon={<Users className="h-4 w-4" />}
          testid="stat-groups"
        />
        <StatCard
          label="Approved stories"
          value={storiesQ.isLoading ? null : approvedStories.length}
          icon={<BookOpen className="h-4 w-4" />}
          testid="stat-approved-stories"
        />
      </section>

      {/* Scheduled today */}
      <section className="mb-8">
        <div className="mb-3 flex items-center gap-2">
          <CalendarCheck className="h-5 w-5 text-primary" />
          <h2 className="font-display text-lg font-semibold">
            Scheduled today
            {dayName(today) ? (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {dayName(today)}
              </span>
            ) : null}
          </h2>
        </div>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-40 rounded-xl" />
            ))}
          </div>
        ) : scheduled.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
              <CalendarCheck className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground" data-testid="text-empty-today">
                No groups scheduled today. Browse all groups to get started.
              </p>
              <Link href="/groups">
                <Button variant="outline" size="sm" data-testid="button-browse-groups">
                  View groups
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {scheduled.map((g) => {
              const latest = latestApprovedFor(g.id);
              return (
                <Card key={g.id} data-testid={`card-today-group-${g.id}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="font-display text-base">
                        {g.name}
                      </CardTitle>
                      {g.schedule ? (
                        <Badge variant="secondary" className="font-normal">
                          {g.schedule}
                        </Badge>
                      ) : null}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-wrap gap-1.5">
                      {g.members.length === 0 ? (
                        <span className="text-xs text-muted-foreground">
                          No members yet
                        </span>
                      ) : (
                        g.members.map((m) => (
                          <StudentChip
                            key={m.id}
                            id={m.id}
                            name={m.name}
                            color={m.color}
                          />
                        ))
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link href="/groups">
                        <Button
                          variant="outline"
                          size="sm"
                          data-testid={`button-open-group-${g.id}`}
                        >
                          Open group
                          <ArrowRight className="ml-1 h-4 w-4" />
                        </Button>
                      </Link>
                      {latest ? (
                        <Link href={`/session/${latest.id}`}>
                          <Button size="sm" data-testid={`button-run-latest-${g.id}`}>
                            <Play className="mr-1 h-4 w-4" />
                            Run latest
                          </Button>
                        </Link>
                      ) : (
                        <span className="self-center text-xs text-muted-foreground">
                          No approved story yet
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Quick links */}
      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">Quick links</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <QuickLink
            href="/groups"
            label="Groups"
            desc="Organize & move students"
            icon={<Users className="h-5 w-5" />}
            testid="quicklink-groups"
          />
          <QuickLink
            href="/students"
            label="Students & Goals"
            desc="Manage roster & IEP goals"
            icon={<GraduationCap className="h-5 w-5" />}
            testid="quicklink-students"
          />
          <QuickLink
            href="/stories"
            label="Story Library"
            desc="Generate & approve stories"
            icon={<BookOpen className="h-5 w-5" />}
            testid="quicklink-stories"
          />
        </div>
      </section>
    </AppShell>
  );
}

function StatCard({
  label,
  value,
  icon,
  testid,
}: {
  label: string;
  value: number | null;
  icon: React.ReactNode;
  testid: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-4">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          {icon}
          <span className="text-xs font-medium">{label}</span>
        </div>
        {value === null ? (
          <Skeleton className="h-7 w-10" />
        ) : (
          <span
            className="font-display text-xl font-bold text-foreground"
            data-testid={`${testid}-value`}
          >
            {value}
          </span>
        )}
      </CardContent>
    </Card>
  );
}

function QuickLink({
  href,
  label,
  desc,
  icon,
  testid,
}: {
  href: string;
  label: string;
  desc: string;
  icon: React.ReactNode;
  testid: string;
}) {
  return (
    <Link href={href}>
      <Card className="hover-elevate cursor-pointer" data-testid={testid}>
        <CardContent className="flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {icon}
          </div>
          <div>
            <div className="font-display text-sm font-semibold">{label}</div>
            <div className="text-xs text-muted-foreground">{desc}</div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
