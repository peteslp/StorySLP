import { useState, useCallback, useEffect, useRef } from "react";
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

  // Keep local panels in sync with the stored comic from the server.
  // `useState(initialPanels)` only reads on first mount, so without this a comic
  // that loads (or refetches) AFTER mount would appear empty and tempt a regenerate.
  // We only adopt stored panels when we're not mid-generation/clear, so an in-progress
  // run is never clobbered. Comparing by joined URLs avoids needless re-renders.
  const generatingRef = useRef(false);
  generatingRef.current = generating;
  const storedKey = initialPanels.map((p) => p.url).join("|");
  useEffect(() => {
    if (generatingRef.current) return;
    setPanels((prev) => {
      const prevKey = prev.map((p) => p.url).join("|");
      return prevKey === storedKey ? prev : initialPanels;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storedKey]);

  const generate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      let from = 0;
      let done = false;
      // Loop one panel per request until the server reports the comic is done.
      // One panel takes ~45s; batching more risks the 60s serverless timeout.
      // Guard with a generous cap so a runaway never loops forever.
      for (let guard = 0; guard < 60 && !done; guard++) {
        const res = await apiRequest("POST", `/api/stories/${storyId}/comic`, {
          from,
          count: 1,
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
