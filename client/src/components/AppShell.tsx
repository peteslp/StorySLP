import { useState, useEffect, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  CalendarCheck,
  Users,
  GraduationCap,
  BookOpen,
  History,
  Moon,
  Sun,
  Menu,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { setToken } from "@/lib/queryClient";

function LogoutButton() {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => {
        setToken(null);
        window.location.reload();
      }}
      data-testid="button-logout"
      className="w-full justify-start gap-3 text-foreground/80"
    >
      <LogOut className="h-5 w-5" />
      <span>Log out</span>
    </Button>
  );
}

const NAV = [
  { href: "/", label: "Today", icon: CalendarCheck, testid: "link-nav-today" },
  { href: "/groups", label: "Groups", icon: Users, testid: "link-nav-groups" },
  {
    href: "/students",
    label: "Students & Goals",
    icon: GraduationCap,
    testid: "link-nav-students",
  },
  {
    href: "/stories",
    label: "Story Library",
    icon: BookOpen,
    testid: "link-nav-stories",
  },
  { href: "/history", label: "History", icon: History, testid: "link-nav-history" },
];

function Logo() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 32 32"
      fill="none"
      aria-label="StorySLP logo"
      className="text-primary shrink-0"
    >
      {/* open book / speech bubble mark */}
      <path
        d="M5 7c4-1.5 7-1.5 11 1 4-2.5 7-2.5 11-1v17c-4-1.5-7-1.5-11 1-4-2.5-7-2.5-11-1V7Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M16 9v17" stroke="currentColor" strokeWidth="2" />
      <circle cx="16" cy="16.5" r="2" fill="currentColor" />
    </svg>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const [location] = useLocation();
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => {
        const active =
          item.href === "/"
            ? location === "/"
            : location.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            data-testid={item.testid}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover-elevate",
              active
                ? "bg-primary text-primary-foreground"
                : "text-foreground/80",
            )}
          >
            <Icon className="h-5 w-5" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/" data-testid="link-brand" className="flex items-center gap-2.5">
      <Logo />
      <div className="leading-tight">
        <div className="font-display text-lg font-bold tracking-tight text-foreground">
          Story<span className="text-primary">SLP</span>
        </div>
        <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          one story. every goal.
        </div>
      </div>
    </Link>
  );
}

function DarkModeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const prefers =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    setDark(prefers);
    document.documentElement.classList.toggle("dark", prefers);
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggle}
      data-testid="button-toggle-dark"
      className="w-full justify-start gap-3"
    >
      {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      <span>{dark ? "Light mode" : "Dark mode"}</span>
    </Button>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-card md:flex">
        <div className="p-5">
          <Brand />
        </div>
        <div className="flex-1 overflow-y-auto px-3">
          <NavLinks />
        </div>
        <div className="border-t p-3 space-y-1">
          <DarkModeToggle />
          <LogoutButton />
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-card px-4 py-3 md:hidden">
        <Brand />
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" data-testid="button-mobile-menu">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <div className="p-5">
              <Brand />
            </div>
            <div className="flex-1 px-3">
              <NavLinks onNavigate={() => setMobileOpen(false)} />
            </div>
            <div className="mt-4 border-t p-3 space-y-1">
              <DarkModeToggle />
              <LogoutButton />
            </div>
          </SheetContent>
        </Sheet>
      </header>

      <main className="md:pl-64">
        <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
