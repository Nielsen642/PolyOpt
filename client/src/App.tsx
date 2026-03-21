import { Switch, Route } from "wouter";
import { WagmiProvider } from "wagmi";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";

// Components
import { Layout } from "@/components/layout";
import { AuthProvider } from "@/hooks/use-auth";
import { AlertsProvider } from "@/hooks/use-alerts";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { AlertMonitor } from "@/components/app/alert-monitor";
import { wagmiAdapter } from "@/lib/wallet-appkit";

// Pages
import Dashboard from "@/pages/dashboard";
import PortfolioDetails from "@/pages/portfolio-details";
import Markets from "@/pages/markets";
import CorrelationHeatmap from "@/pages/correlation-heatmap";
import HedgeMapPage from "@/pages/hedge-map";
import AlertsPage from "@/pages/alerts";
import IntegrationsPage from "@/pages/integrations";
import MarketScanPage from "@/pages/market-scan";

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route>
        <ProtectedRoute>
          <Layout>
            <AlertMonitor />
            <Switch>
              <Route path="/" component={Dashboard} />
              <Route path="/portfolio/:id" component={PortfolioDetails} />
              <Route path="/markets" component={Markets} />
              <Route path="/market-scan" component={MarketScanPage} />
              <Route path="/correlations" component={CorrelationHeatmap} />
              <Route path="/hedge-map" component={HedgeMapPage} />
              <Route path="/alerts" component={AlertsPage} />
              <Route path="/integrations" component={IntegrationsPage} />
              <Route component={NotFound} />
            </Switch>
          </Layout>
        </ProtectedRoute>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiAdapter.wagmiConfig}>
        <TooltipProvider>
          <AuthProvider>
            <AlertsProvider>
              <Toaster />
              <Router />
            </AlertsProvider>
          </AuthProvider>
        </TooltipProvider>
      </WagmiProvider>
    </QueryClientProvider>
  );
}

export default App;
