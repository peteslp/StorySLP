import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Today from "@/pages/Today";
import Groups from "@/pages/Groups";
import Students from "@/pages/Students";
import StoryLibrary from "@/pages/StoryLibrary";
import RunSession from "@/pages/RunSession";
import History from "@/pages/History";

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

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router hook={useHashLocation}>
          <AppRouter />
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
