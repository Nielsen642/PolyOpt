import { motion } from "framer-motion";
import { Briefcase } from "lucide-react";
import { useDashboard } from "@/hooks/use-portfolios";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { OverviewCards } from "@/components/dashboard/overview-cards";
import { PortfolioCard } from "@/components/dashboard/portfolio-card";

export default function Dashboard() {
  const { data, isLoading } = useDashboard();

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Portfolios</h1>
          <p className="text-muted-foreground mt-1">
            Backend-derived portfolio analytics, risk, and hedge readiness.
          </p>
        </div>
      </div>

      {data && <OverviewCards overview={data.overview} />}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="glass-panel border-border/30 h-40 animate-pulse bg-card/20" />
          ))}
        </div>
      ) : data?.portfolios.length === 0 ? (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel border-dashed border-border p-12 text-center rounded-xl flex flex-col items-center justify-center space-y-4 bg-card/30"
        >
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-2">
            <Briefcase className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-xl font-semibold">No portfolios found</h3>
          <p className="text-muted-foreground max-w-md">
            Connect your Polymarket wallet to see your portfolio analytics, risk, and hedge readiness.
          </p>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {data?.portfolios.map((portfolio, idx) => (
            <motion.div
              key={portfolio.portfolio.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
            >
              <PortfolioCard item={portfolio} />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
