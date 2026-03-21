import { useState } from "react";
import { Redirect } from "wouter";
import { BarChart4, Lock } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const { isAuthenticated, login, loginPending, register, registerPending } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  if (isAuthenticated) {
    return <Redirect to="/" />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="glass-panel w-full max-w-md border-border/50">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <BarChart4 className="h-7 w-7" />
          </div>
          <div>
            <CardTitle className="text-2xl">POLYOPT Control</CardTitle>
            <p className="mt-2 text-sm text-muted-foreground">
              Sign in to access protected analytics, Hedge Map, alerts, and integrations.
            </p>
          </div>
        </CardHeader>

        <CardContent>
          <form
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              setError("");
              try {
                if (mode === "login") {
                  await login(username, password);
                } else {
                  await register(username, displayName, password);
                }
              } catch {
                setError(
                  mode === "login"
                    ? "Sign in failed. Check your stored account credentials."
                    : "Registration failed. Username may already exist or the password is too short.",
                );
              }
            }}
          >
            <div className="flex gap-2">
              <Button type="button" variant={mode === "login" ? "default" : "outline"} className="flex-1" onClick={() => setMode("login")}>
                Sign In
              </Button>
              <Button type="button" variant={mode === "register" ? "default" : "outline"} className="flex-1" onClick={() => setMode("register")}>
                Create Account
              </Button>
            </div>

            {mode === "register" && (
              <div className="space-y-2">
                <Label htmlFor="displayName">Display Name</Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input id="username" value={username} onChange={(event) => setUsername(event.target.value)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>

            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loginPending || registerPending}>
              <Lock className="mr-2 h-4 w-4" />
              {mode === "login"
                ? loginPending
                  ? "Signing in..."
                  : "Sign In"
                : registerPending
                  ? "Creating account..."
                  : "Create Account"}
            </Button>

            <div className="text-center text-xs text-muted-foreground">
              Accounts are now stored in the database and authenticated through hashed passwords.
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
