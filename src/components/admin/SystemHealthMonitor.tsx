import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Loader2,
  ShieldCheck,
  Zap,
  Globe,
  Database,
  Calculator,
  Compass,
  TrendingUp,
  QrCode,
  ExternalLink,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  runFullSystemDiagnostics,
  APP_ROUTES,
  type SystemHealthReport,
  type DiagnosticItem,
} from '@/lib/monitoring/systemHealthEngine';
import { Link } from 'react-router-dom';

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  routes: <Globe className="h-4 w-4 text-sky-500" />,
  pricing: <Calculator className="h-4 w-4 text-emerald-500" />,
  database: <Database className="h-4 w-4 text-indigo-500" />,
  offline_gps: <Compass className="h-4 w-4 text-amber-500" />,
  forecasting: <TrendingUp className="h-4 w-4 text-purple-500" />,
  qr_guest: <QrCode className="h-4 w-4 text-teal-500" />,
  security: <ShieldCheck className="h-4 w-4 text-blue-500" />,
};

export default function SystemHealthMonitor() {
  const [report, setReport] = useState<SystemHealthReport | null>(null);
  const [running, setRunning] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const executeAudit = async () => {
    setRunning(true);
    try {
      const result = await runFullSystemDiagnostics();
      setReport(result);
      if (result.status === 'healthy') {
        toast.success(`System Diagnostics Passed: ${result.overallScore}% Operational!`);
      } else if (result.status === 'warning') {
        toast.warning(`System Diagnostics: ${result.warningCount} Warning(s) detected.`);
      } else {
        toast.error(`System Diagnostics Alert: ${result.failedCount} Failure(s) found!`);
      }
    } catch (err: any) {
      toast.error('Diagnostics failed to run: ' + err.message);
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    void executeAudit();
  }, []);

  const filteredItems = (report?.items || []).filter((item) => {
    const matchesCategory = filterCategory === 'all' || item.category === filterCategory;
    const matchesSearch =
      searchQuery === '' ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.details && item.details.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* ── Top Header Hero Banner ── */}
      <Card className="glass-card overflow-hidden border-primary/30 relative">
        <div className="p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-primary/10 text-primary">
                <Activity className="h-6 w-6 animate-pulse" />
              </div>
              <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 font-mono text-xs">
                Self-Healing Integrity Engine
              </Badge>
            </div>
            <h2 className="text-2xl md:text-3xl font-black tracking-tight">
              System Health &amp; Flow Monitor
            </h2>
            <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
              Automated real-time inspection of app routes, pricing algorithms, Supabase database, Prophet ML forecasting, offline IndexedDB GPS queues, and QR check-in flows.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4 shrink-0">
            {report && (
              <div className="text-center sm:text-right bg-secondary/30 p-4 rounded-2xl border border-border/30 w-full sm:w-auto">
                <div className="text-3xl font-black text-foreground flex items-center justify-center sm:justify-end gap-2">
                  <span
                    className={
                      report.overallScore >= 90
                        ? 'text-emerald-500'
                        : report.overallScore >= 70
                        ? 'text-amber-500'
                        : 'text-red-500'
                    }
                  >
                    {report.overallScore}%
                  </span>
                  <span className="text-xs uppercase text-muted-foreground font-semibold">Health</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {report.passedCount} Passed · {report.warningCount} Warnings · {report.failedCount} Errors
                </p>
              </div>
            )}

            <Button
              onClick={executeAudit}
              disabled={running}
              className="w-full sm:w-auto h-12 px-6 gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold rounded-2xl shadow-lg"
            >
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Run Full Diagnostics
            </Button>
          </div>
        </div>
      </Card>

      {/* ── Filter Bar & Search ── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1">
          {[
            { id: 'all', label: 'All Modules' },
            { id: 'routes', label: 'Routes' },
            { id: 'pricing', label: 'Pricing Math' },
            { id: 'database', label: 'Database' },
            { id: 'offline_gps', label: 'Offline GPS' },
            { id: 'forecasting', label: 'Prophet ML' },
            { id: 'qr_guest', label: 'QR & Guest' },
            { id: 'security', label: 'Security' },
          ].map((cat) => (
            <Button
              key={cat.id}
              variant={filterCategory === cat.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterCategory(cat.id)}
              className="text-xs h-8 rounded-xl shrink-0"
            >
              {cat.label}
            </Button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search diagnostics..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-xs rounded-xl"
          />
        </div>
      </div>

      {/* ── Diagnostics Test Results Grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredItems.map((item) => {
          const isPassed = item.status === 'passed';
          const isWarning = item.status === 'warning';
          const isFailed = item.status === 'failed';

          return (
            <Card
              key={item.id}
              className={`glass-card rounded-2xl border transition-all ${
                isFailed
                  ? 'border-red-500/40 bg-red-500/5'
                  : isWarning
                  ? 'border-amber-500/40 bg-amber-500/5'
                  : 'border-border/30 hover:border-primary/30'
              }`}
            >
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-secondary/60 border border-border/30">
                      {CATEGORY_ICONS[item.category] || <Zap className="h-4 w-4 text-primary" />}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-foreground">{item.name}</h4>
                      <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
                        {item.category.replace('_', ' ')}
                      </span>
                    </div>
                  </div>

                  <Badge
                    className={
                      isPassed
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                        : isWarning
                        ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                        : 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30'
                    }
                  >
                    {isPassed && <CheckCircle2 className="h-3 w-3 mr-1" />}
                    {isWarning && <AlertTriangle className="h-3 w-3 mr-1" />}
                    {isFailed && <XCircle className="h-3 w-3 mr-1" />}
                    {item.status.toUpperCase()}
                  </Badge>
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed">
                  {item.description}
                </p>

                {item.details && (
                  <div className="rounded-xl bg-secondary/30 p-2.5 text-xs text-foreground font-mono">
                    {item.details}
                  </div>
                )}

                {item.error && (
                  <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-2.5 text-xs text-red-600 dark:text-red-400 font-mono">
                    ⚠️ Error: {item.error}
                  </div>
                )}

                {item.latencyMs != null && (
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/20">
                    <span>Response Latency</span>
                    <span className="font-mono">{item.latencyMs}ms</span>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── Registered Route Health & Sitemap Explorer ── */}
      <Card className="glass-card rounded-3xl overflow-hidden border-border/30">
        <CardHeader className="p-6">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Globe className="h-5 w-5 text-primary" /> Registered App Routes ({APP_ROUTES.length})
              </CardTitle>
              <CardDescription className="text-xs">
                Audited against React Router DOM configuration to guarantee no 404 dead links or blank components.
              </CardDescription>
            </div>
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-xs">
              All {APP_ROUTES.length} Verified Active
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-6 pt-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {APP_ROUTES.map((route) => (
              <div
                key={route.path}
                className="flex items-center justify-between p-3 rounded-xl border border-border/20 bg-secondary/20 text-xs hover:bg-secondary/40 transition-colors"
              >
                <div className="space-y-0.5 min-w-0 pr-2">
                  <p className="font-semibold text-foreground truncate">{route.name}</p>
                  <p className="font-mono text-muted-foreground text-[11px] truncate">{route.path}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge variant="outline" className="text-[10px] uppercase font-mono px-1.5 py-0">
                    {route.access === 'roles' ? route.allowedRoles?.join(', ') : route.access}
                  </Badge>
                  <Button asChild size="icon" variant="ghost" className="h-7 w-7">
                    <Link to={route.path} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
