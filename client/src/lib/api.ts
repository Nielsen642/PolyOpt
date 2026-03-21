import { z } from "zod";
import {
  api,
  buildUrl,
  type InsertPosition,
  type OptimizationRequest,
  type HedgePreviewRequest,
} from "@shared/routes";

async function parseResponse<T>(response: Response, schema: { parse: (value: unknown) => T }): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Request failed");
  }

  return schema.parse(await response.json());
}

export const portfolioApi = {
  getDashboard: async () =>
    parseResponse(await fetch(api.dashboard.get.path, { credentials: "include" }), api.dashboard.get.responses[200]),
  list: async () =>
    parseResponse(await fetch(api.portfolios.list.path, { credentials: "include" }), api.portfolios.list.responses[200]),
  create: async (input: { name: string }) =>
    parseResponse(
      await fetch(api.portfolios.create.path, {
        method: api.portfolios.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        credentials: "include",
      }),
      api.portfolios.create.responses[201],
    ),
  getDetail: async (portfolioId: number) =>
    parseResponse(
      await fetch(buildUrl(api.portfolios.get.path, { portfolioId }), { credentials: "include" }),
      api.portfolios.get.responses[200],
    ),
  getPositions: async (portfolioId: number) =>
    parseResponse(
      await fetch(buildUrl(api.positions.list.path, { portfolioId }), { credentials: "include" }),
      api.positions.list.responses[200],
    ),
  addPosition: async (portfolioId: number, input: Omit<InsertPosition, "portfolioId">) =>
    parseResponse(
      await fetch(buildUrl(api.positions.add.path, { portfolioId }), {
        method: api.positions.add.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        credentials: "include",
      }),
      api.positions.add.responses[201],
    ),
  optimize: async (portfolioId: number, input: OptimizationRequest) =>
    parseResponse(
      await fetch(buildUrl(api.optimization.run.path, { portfolioId }), {
        method: api.optimization.run.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        credentials: "include",
      }),
      api.optimization.run.responses[200],
    ),
  previewHedge: async (input: HedgePreviewRequest) =>
    parseResponse(
      await fetch(api.optimization.preview.path, {
        method: api.optimization.preview.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        credentials: "include",
      }),
      api.optimization.preview.responses[200],
    ),
};

export const marketApi = {
  list: async () =>
    parseResponse(await fetch(api.markets.list.path, { credentials: "include" }), api.markets.list.responses[200]),
  getCorrelations: async (
    weights: Partial<{
      price: number;
      direction: number;
      openInterest: number;
      totalShares: number;
      confidence: number;
    }> = {},
  ) => {
    const qs = new URLSearchParams();
    if (weights.price !== undefined) qs.set("price", String(weights.price));
    if (weights.direction !== undefined) qs.set("direction", String(weights.direction));
    if (weights.openInterest !== undefined) qs.set("openInterest", String(weights.openInterest));
    if (weights.totalShares !== undefined) qs.set("totalShares", String(weights.totalShares));
    if (weights.confidence !== undefined) qs.set("confidence", String(weights.confidence));

    const url = qs.toString().length > 0 ? `${api.correlations.get.path}?${qs.toString()}` : api.correlations.get.path;

    return parseResponse(
      await fetch(url, { credentials: "include" }),
      api.correlations.get.responses[200],
    );
  },
};

export const proApi = {
  getMeta: async () => {
    const r = await fetch(api.pro.meta.path, { credentials: "include" });
    if (!r.ok) return null;
    return api.pro.meta.responses[200].parse(await r.json());
  },
  getRiskReport: async () => {
    const r = await fetch(api.pro.riskReport.path, { credentials: "include" });
    if (r.status === 403) return null;
    if (!r.ok) {
      const text = await r.text();
      throw new Error(text || "Risk report failed");
    }
    return api.pro.riskReport.responses[200].parse(await r.json());
  },
};

const userWalletResponseSchema = z.object({
  user: z.object({
    id: z.number(),
    username: z.string(),
    displayName: z.string(),
    role: z.string(),
    walletAddress: z.string().nullable(),
  }),
});

export const userApi = {
  updateWallet: async (walletAddress: string | null) =>
    parseResponse(
      await fetch("/api/user/wallet", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress }),
        credentials: "include",
      }),
      userWalletResponseSchema,
    ),
};

export const authApi = {
  getSession: async () =>
    parseResponse(await fetch(api.auth.session.path, { credentials: "include" }), api.auth.session.responses[200]),
  register: async (username: string, displayName: string, password: string) =>
    parseResponse(
      await fetch(api.auth.register.path, {
        method: api.auth.register.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, displayName, password }),
        credentials: "include",
      }),
      api.auth.register.responses[201],
    ),
  login: async (username: string, password: string) =>
    parseResponse(
      await fetch(api.auth.login.path, {
        method: api.auth.login.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
        credentials: "include",
      }),
      api.auth.login.responses[200],
    ),
  logout: async () =>
    parseResponse(
      await fetch(api.auth.logout.path, {
        method: api.auth.logout.method,
        credentials: "include",
      }),
      api.auth.logout.responses[200],
    ),
};
