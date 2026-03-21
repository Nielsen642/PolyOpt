import { useMutation } from "@tanstack/react-query";
import { type OptimizationRequest } from "@shared/routes";
import { portfolioApi } from "@/lib/api";

export function useOptimize(portfolioId: number) {
  return useMutation({
    mutationFn: (data: OptimizationRequest) => portfolioApi.optimize(portfolioId, data),
  });
}
