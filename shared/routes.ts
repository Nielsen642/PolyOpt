import { z } from "zod";
import {
  correlationMatrixSchema,
  dashboardSchema,
  insertPortfolioSchema,
  insertPositionSchema,
  marketSnapshotSchema,
  marketsListResponseSchema,
  hedgePreviewRequestSchema,
  optimizationRequestSchema,
  optimizationResponseSchema,
  type HedgePreviewRequest,
  authLoginSchema,
  authRegisterSchema,
  authSessionSchema,
  portfolioDetailSchema,
  portfolioSchema,
  positionAnalyticsSchema,
  proAlertStatePutSchema,
  proRiskReportSchema,
  type InsertPortfolio,
  type InsertPosition,
  type OptimizationRequest,
  type OptimizationResponse,
  type PortfolioDetail,
} from "./schema";

const proMetaSchema = z.object({
  proMode: z.boolean(),
  demoMode: z.boolean(),
  productionHardening: z.boolean(),
  staleWarningAfterMs: z.number().int().nonnegative(),
  features: z.object({
    serverAlertPersistence: z.boolean(),
    serverClobRelay: z.boolean(),
    riskAttributionApi: z.boolean(),
    rateLimitedApi: z.boolean(),
  }),
  clobRelayConfigured: z.boolean(),
});

const proAlertStateGetSchema = z.object({
  rules: proAlertStatePutSchema.shape.rules,
  events: proAlertStatePutSchema.shape.events,
  updatedAt: z.string(),
});

export const errorSchemas = {
  validation: z.object({ message: z.string(), field: z.string().optional() }),
  notFound: z.object({ message: z.string() }),
  internal: z.object({ message: z.string() }),
};

export const api = {
  auth: {
    session: {
      method: "GET" as const,
      path: "/api/auth/session" as const,
      responses: {
        200: authSessionSchema,
      },
    },
    login: {
      method: "POST" as const,
      path: "/api/auth/login" as const,
      input: authLoginSchema,
      responses: {
        200: authSessionSchema,
      },
    },
    register: {
      method: "POST" as const,
      path: "/api/auth/register" as const,
      input: authRegisterSchema,
      responses: {
        201: authSessionSchema,
      },
    },
    logout: {
      method: "POST" as const,
      path: "/api/auth/logout" as const,
      responses: {
        200: authSessionSchema,
      },
    },
  },
  dashboard: {
    get: {
      method: "GET" as const,
      path: "/api/dashboard" as const,
      responses: {
        200: dashboardSchema,
      },
    },
  },
  portfolios: {
    list: {
      method: "GET" as const,
      path: "/api/portfolios" as const,
      responses: {
        200: z.array(portfolioSchema),
      },
    },
    create: {
      method: "POST" as const,
      path: "/api/portfolios" as const,
      input: insertPortfolioSchema.omit({ userId: true }),
      responses: {
        201: portfolioSchema,
      },
    },
    get: {
      method: "GET" as const,
      path: "/api/portfolios/:portfolioId" as const,
      responses: {
        200: portfolioDetailSchema,
      },
    },
  },
  positions: {
    list: {
      method: "GET" as const,
      path: "/api/portfolios/:portfolioId/positions" as const,
      responses: {
        200: z.array(positionAnalyticsSchema),
      }
    },
    add: {
      method: "POST" as const,
      path: "/api/portfolios/:portfolioId/positions" as const,
      input: insertPositionSchema
        .omit({ portfolioId: true })
        .extend({
          yesShares: z.coerce.number().nonnegative(),
          noShares: z.coerce.number().nonnegative(),
          price: z.coerce.number().min(0).max(1),
        }),
      responses: {
        201: positionAnalyticsSchema,
      }
    }
  },
  optimization: {
    run: {
      method: "POST" as const,
      path: "/api/portfolios/:portfolioId/optimization" as const,
      input: optimizationRequestSchema,
      responses: {
        200: optimizationResponseSchema,
      }
    },
    preview: {
      method: "POST" as const,
      path: "/api/hedge-preview" as const,
      input: hedgePreviewRequestSchema,
      responses: {
        200: optimizationResponseSchema,
      }
    },
  },
  markets: {
    list: {
      method: "GET" as const,
      path: "/api/markets" as const,
      responses: {
        200: marketsListResponseSchema,
      }
    }
  },
  pro: {
    meta: {
      method: "GET" as const,
      path: "/api/pro/meta" as const,
      responses: {
        200: proMetaSchema,
      },
    },
    alerts: {
      get: {
        method: "GET" as const,
        path: "/api/pro/alerts" as const,
        responses: {
          200: proAlertStateGetSchema,
        },
      },
      put: {
        method: "PUT" as const,
        path: "/api/pro/alerts" as const,
        input: proAlertStatePutSchema,
        responses: {
          200: proAlertStateGetSchema,
        },
      },
    },
    riskReport: {
      method: "GET" as const,
      path: "/api/pro/risk-report" as const,
      responses: {
        200: proRiskReportSchema,
      },
    },
  },
  correlations: {
    get: {
      method: "GET" as const,
      path: "/api/correlations" as const,
      responses: {
        200: correlationMatrixSchema,
      }
    }
  }
};

export const ws = {
  send: {
    subscribe: z.object({ market_ids: z.array(z.string()) })
  },
  receive: {
    market_snapshot: marketSnapshotSchema,
  }
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}

export type { InsertPortfolio, InsertPosition, OptimizationRequest, OptimizationResponse, PortfolioDetail, HedgePreviewRequest };
