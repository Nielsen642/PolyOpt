import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { marketApi } from "@/lib/api";

export type CorrelationVectorWeights = {
  price?: number;
  direction?: number;
  openInterest?: number;
  totalShares?: number;
  confidence?: number;
};

export function useCorrelations(enabled = true, weights: CorrelationVectorWeights = {}) {
  return useQuery({
    queryKey: [api.correlations.get.path, weights],
    queryFn: () => marketApi.getCorrelations(weights),
    enabled,
    refetchInterval: 300000, // 5 minutes
  });
}
