import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  Briefcase,
  Activity,
  BarChart4,
  BellRing,
  Menu,
  Network,
  PlugZap,
  TrendingUp,
  Wallet,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useAuth } from "@/hooks/use-auth";
import { useAccount } from "wagmi";
import { useAppKit } from "@reown/appkit/react";
import { StatusBanner } from "@/components/app/status-banner";
import { useQuery } from "@tanstack/react-query";
import { proApi } from "@/lib/api";

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { user, logout, logoutPending } = useAuth();
  const { address } = useAccount();
  const { open } = useAppKit();
  const { data: proMeta } = useQuery({
    queryKey: ["/api/pro/meta", "layout"],
    queryFn: () => proApi.getMeta(),
    staleTime: 120_000,
  });

  const navItems = [
    { href: "/", label: "Portfolios", icon: Briefcase },
    { href: "/markets", label: "Live Markets", icon: Activity },
    { href: "/market-scan", label: "Market Scan", icon: Search },
    { href: "/correlations", label: "Correlations", icon: TrendingUp },
    { href: "/hedge-map", label: "Hedge Map", icon: Network },
    { href: "/alerts", label: "Alerts", icon: BellRing },
    { href: "/integrations", label: "Integrations", icon: PlugZap },
  ];

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Sidebar */}
      <aside className="hidden w-64 flex-shrink-0 border-r border-border bg-card/30 backdrop-blur-xl md:flex md:flex-col z-10">
        <div className="h-16 flex items-center px-6 border-b border-border/50">
          <div className="flex items-center gap-2 text-primary font-bold text-lg tracking-wider">
            <BarChart4 className="w-6 h-6 text-primary animate-pulse" />
            POLY<span className="text-foreground">OPT</span>
            {proMeta?.proMode ? (
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/35">
                Pro
              </span>
            ) : null}
          </div>
        </div>
        
        <NavItems items={navItems} location={location} />

        <div className="p-4 border-t border-border/50">
          <Link
            href="/integrations"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
          >
            <PlugZap className="h-4 w-4" />
            <span>System Controls</span>
          </Link>
          <div className="mt-4 px-3 py-2 bg-black/40 rounded-lg border border-border/50">
            <div className="text-xs text-muted-foreground mb-1">Operator Session</div>
            <div className="flex items-center gap-2 text-xs font-mono-data">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
              <span className="text-emerald-400">{user?.displayName ?? "Signed in"}</span>
            </div>
            <Button className="mt-3 w-full" variant="outline" onClick={() => void logout()} disabled={logoutPending}>
              {logoutPending ? "Signing out..." : "Sign Out"}
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile Header */}
        <header className="h-16 border-b border-border/50 bg-card/50 backdrop-blur-md flex items-center px-4 md:hidden justify-between">
          <div className="flex items-center gap-2 text-primary font-bold">
            <BarChart4 className="w-5 h-5 text-primary" />
            POLY<span className="text-foreground">OPT</span>
            {proMeta?.proMode ? (
              <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/35">
                Pro
              </span>
            ) : null}
          </div>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="border-border bg-background/95">
              <SheetHeader>
                <SheetTitle>Navigation</SheetTitle>
              </SheetHeader>
              <div className="mt-6">
                <NavItems items={navItems} location={location} />
              </div>
            </SheetContent>
          </Sheet>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto p-4 md:p-8 relative">
          {/* Subtle grid background for terminal feel */}
          <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>
          
          <div className="relative z-10 max-w-7xl mx-auto h-full">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <StatusBanner />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    void open();
                  }}
                >
                  <Wallet className="mr-2 h-4 w-4" />
                  {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "Connect Wallet"}
                </Button>
              </div>
            </div>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

function NavItems({
  items,
  location,
}: {
  items: Array<{ href: string; label: string; icon: typeof Briefcase }>;
  location: string;
}) {
  return (
    <nav className="flex-1 space-y-2 px-4 py-6">
      <div className="mb-4 px-2 text-xs font-mono uppercase tracking-widest text-muted-foreground">
        Analytics Menu
      </div>
      {items.map((item) => {
        const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`
              flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200
              ${isActive
                ? "border border-primary/20 bg-primary/10 text-primary shadow-[0_0_15px_rgba(59,130,246,0.1)]"
                : "text-muted-foreground hover:bg-white/5 hover:text-foreground"}
            `}
          >
            <item.icon className="h-4 w-4" />
            <span className="font-medium">{item.label}</span>
            {isActive && <div className="ml-auto h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />}
          </Link>
        );
      })}
    </nav>
  );
}
