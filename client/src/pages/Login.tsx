import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { setToken } from "@/lib/queryClient";
import { Loader2, BookOpen } from "lucide-react";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

export default function Login({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        setError(res.status === 401 ? "Incorrect password. Try again." : "Login failed. Please retry.");
        setLoading(false);
        return;
      }
      const data = await res.json();
      setToken(data.token);
      onSuccess();
    } catch {
      setError("Couldn't reach the server. Check your connection.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6 text-center">
          <div className="flex items-center gap-2 mb-2">
            <BookOpen className="h-8 w-8 text-primary" />
            <span className="text-2xl font-bold font-display tracking-tight text-foreground">
              Story<span className="text-primary">SLP</span>
            </span>
          </div>
          <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">One story. Every goal.</p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  data-testid="input-password"
                />
              </div>
              {error && (
                <p className="text-sm text-destructive" data-testid="text-login-error">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={loading || !password} data-testid="button-login">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Log in"}
              </Button>
            </form>
          </CardContent>
        </Card>
        <p className="text-center text-xs text-muted-foreground mt-4">Private workspace · authorized access only</p>
      </div>
    </div>
  );
}
