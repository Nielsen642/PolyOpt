import { createContext, useContext, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AuthUser } from "@shared/schema";
import { api } from "@shared/routes";
import { authApi } from "@/lib/api";

type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  register: (username: string, displayName: string, password: string) => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  registerPending: boolean;
  loginPending: boolean;
  logoutPending: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const sessionQuery = useQuery({
    queryKey: [api.auth.session.path],
    queryFn: authApi.getSession,
    retry: false,
  });

  const loginMutation = useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) =>
      authApi.login(username, password),
    onSuccess: (data) => {
      queryClient.setQueryData([api.auth.session.path], data);
    },
  });

  const registerMutation = useMutation({
    mutationFn: ({
      username,
      displayName,
      password,
    }: {
      username: string;
      displayName: string;
      password: string;
    }) => authApi.register(username, displayName, password),
    onSuccess: (data) => {
      queryClient.setQueryData([api.auth.session.path], data);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: authApi.logout,
    onSuccess: (data) => {
      queryClient.setQueryData([api.auth.session.path], data);
      queryClient.removeQueries({ queryKey: [api.dashboard.get.path] });
    },
  });

  const value = useMemo<AuthContextValue>(
    () => ({
      user: sessionQuery.data?.user ?? null,
      isLoading: sessionQuery.isLoading,
      isAuthenticated: !!sessionQuery.data?.user,
      register: async (username: string, displayName: string, password: string) => {
        await registerMutation.mutateAsync({ username, displayName, password });
      },
      login: async (username: string, password: string) => {
        await loginMutation.mutateAsync({ username, password });
      },
      logout: async () => {
        await logoutMutation.mutateAsync();
      },
      registerPending: registerMutation.isPending,
      loginPending: loginMutation.isPending,
      logoutPending: logoutMutation.isPending,
    }),
    [loginMutation, logoutMutation, registerMutation, sessionQuery.data?.user, sessionQuery.isLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
