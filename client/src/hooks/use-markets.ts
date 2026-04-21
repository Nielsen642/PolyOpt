import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { marketApi } from "@/lib/api";

export function useMarkets(enabled = true) {
  return useQuery({
    queryKey: [api.markets.list.path],
    queryFn: marketApi.list,
    enabled,
    refetchInterval: 60000,
  });
}
