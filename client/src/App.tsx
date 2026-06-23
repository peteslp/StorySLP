import { useEffect, useState } from "react";
import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient, getToken, setToken, setUnauthorizedHandler } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Loader2 } from "lucide-react";
import NotFound from "@/pages/not-found";
import Login from "@/pages/Login";
import Today from "@/pages/Today";
import Groups from "@/pages/Groups";
import Students from "@/pages/Students";
import StoryLibrary from "@/pages/StoryLibrary";
import RunSession from "@/pages/RunSession";
import History from "@/pages/History";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={Today} />
      <Route path="/groups" component={Groups} />
      <Route path="/students" component={Students} />
      <Route path="/stories" component={StoryLibrary} />
      <Route path="/session/:storyId" component={RunSession} />
      <Route path="/history" component={History} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthGate() {
  // null = checking, false = logged out, true = logged in
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    setUnauthorizedHandler(() => setAuthed(false));
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      const token = getToken();
      if (!token) {
        if (!cancelled) setAuthed(false);
        return;
      }
      try {
        const res = await fetch(`${API_BASE}/api/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!cancelled) {
          if (res.ok) {
            setAuthed(true);
          } else {
            setToken(null);
            setAuthed(false);
          }
        }
      } catch {
        // network hiccup — assume token is fine so the app still loads offline-ish
        if (!cancelled) setAuthed(!!token);
      }
    }
    check();
    return () => {
      cancelled = true;
    };
  }, []);

  if (authed === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!authed) {
    return <Login onSuccess={() => setAuthed(true)} />;
  }

  return (
    <Router hook={useHashLocation}>
      <AppRouter />
    </Router>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <AuthGate />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
