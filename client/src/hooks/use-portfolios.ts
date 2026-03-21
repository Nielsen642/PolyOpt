import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type InsertPosition } from "@shared/routes";
import { portfolioApi } from "@/lib/api";

export function useDashboard(enabled = true) {
  return useQuery({
    queryKey: [api.dashboard.get.path],
    queryFn: portfolioApi.getDashboard,
    enabled,
  });
}

export function useCreatePortfolio() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string }) => portfolioApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.dashboard.get.path] });
      queryClient.invalidateQueries({ queryKey: [api.portfolios.list.path] });
    },
  });
}

export function usePortfolioDetails(portfolioId: number, enabled = true) {
  return useQuery({
    queryKey: [buildUrl(api.portfolios.get.path, { portfolioId })],
    queryFn: () => portfolioApi.getDetail(portfolioId),
    enabled: !!portfolioId && enabled,
  });
}

export function usePositions(portfolioId: number, enabled = true) {
  return useQuery({
    queryKey: [buildUrl(api.positions.list.path, { portfolioId })],
    queryFn: () => portfolioApi.getPositions(portfolioId),
    enabled: !!portfolioId && enabled,
  });
}

export function useAddPosition(portfolioId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<InsertPosition, "portfolioId">) =>
      portfolioApi.addPosition(portfolioId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.dashboard.get.path] });
      queryClient.invalidateQueries({
        queryKey: [buildUrl(api.portfolios.get.path, { portfolioId })],
      });
      queryClient.invalidateQueries({ queryKey: [buildUrl(api.positions.list.path, { portfolioId })] });
    },
  });
}
