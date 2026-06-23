import { useState, useCallback } from "react";
import type { ComicPanel } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface BatchResult {
  done: boolean;
  next_from: number;
  total: number;
  completed: number;
  panels: ComicPanel[];
  image_status: string;
}

// Drives the batched comic-generation endpoint: calls it repeatedly (a few panels
// per request) until every scene has a panel, surfacing live progress.
export function useComic(storyId: number, initialPanels: ComicPanel[] = []) {
  const [panels, setPanels] = useState<ComicPanel[]>(initialPanels);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      let from = 0;
      let done = false;
      // Loop batches until the server reports the whole comic is done.
      // Guard with a generous cap so a runaway never loops forever.
      for (let guard = 0; guard < 40 && !done; guard++) {
        const res = await apiRequest("POST", `/api/stories/${storyId}/comic`, {
          from,
          count: 3,
        });
        const data = (await res.json()) as BatchResult;
        setPanels(data.panels || []);
        setProgress({ completed: data.completed, total: data.total });
        done = data.done;
        from = data.next_from;
      }
      queryClient.invalidateQueries({ queryKey: ["/api/stories"] });
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setGenerating(false);
    }
  }, [storyId]);

  const clear = useCallback(async () => {
    try {
      await apiRequest("DELETE", `/api/stories/${storyId}/comic`);
      setPanels([]);
      setProgress(null);
      queryClient.invalidateQueries({ queryKey: ["/api/stories"] });
    } catch (e: any) {
      setError(String(e?.message || e));
    }
  }, [storyId]);

  return { panels, generating, progress, error, generate, clear, setPanels };
}
