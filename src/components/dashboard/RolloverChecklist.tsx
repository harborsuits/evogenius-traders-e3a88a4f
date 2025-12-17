import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  AlertTriangle,
  Download,
  RefreshCw,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SnapshotData {
  timestamp: string;
  generation_id: string;
  generation_number: number;
  hours_elapsed: number;
  learnable_fills: number;
  unique_agents: number;
  unique_symbols: number;
  open_positions: number;
  total_notional: number;
  cash: number;
  equity: number;
  drawdown_pct: number;
}

function CheckItem({ 
  label, 
  status, 
  detail 
}: { 
  label: string; 
  status: 'pass' | 'fail' | 'pending' | 'unknown'; 
  detail?: string;
}) {
  const icons = {
    pass: <CheckCircle2 className="h-4 w-4 text-green-500" />,
    fail: <XCircle className="h-4 w-4 text-red-500" />,
    pending: <Clock className="h-4 w-4 text-yellow-500" />,
    unknown: <AlertTriangle className="h-4 w-4 text-muted-foreground" />,
  };

  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-border/30 last:border-0">
      {icons[status]}
      <div className="flex-1 min-w-0">
        <div className="text-xs font-mono">{label}</div>
        {detail && (
          <div className="text-[10px] text-muted-foreground font-mono truncate">
            {detail}
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ 
  title, 
  badge, 
  children,
  defaultOpen = false 
}: { 
  title: string; 
  badge?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  
  return (
    <div className="border border-border/50 rounded-md mb-2">
      <button 
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 p-2 text-left hover:bg-muted/30 transition-colors"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <span className="text-xs font-mono font-medium flex-1">{title}</span>
        {badge && (
          <Badge variant="outline" className="text-[10px]">{badge}</Badge>
        )}
      </button>
      {open && (
        <div className="px-3 pb-2">
          {children}
        </div>
      )}
    </div>
  );
}

export function RolloverChecklist() {
  const [savedSnapshot, setSavedSnapshot] = useState<SnapshotData | null>(null);

  // Pre-rollover snapshot data
  const { data: snapshot, isLoading, refetch } = useQuery({
    queryKey: ['rollover-snapshot'],
    queryFn: async (): Promise<SnapshotData> => {
      // Get system state
      const { data: state } = await supabase
        .from('system_state')
        .select('current_generation_id')
        .single();

      const genId = state?.current_generation_id;

      // Get generation details
      const { data: gen } = await supabase
        .from('generations')
        .select('generation_number, start_time')
        .eq('id', genId || '')
        .single();

      const hoursElapsed = gen?.start_time 
        ? (Date.now() - new Date(gen.start_time).getTime()) / (1000 * 60 * 60)
        : 0;

      // Get learnable fills count
      const { count: fillsCount } = await supabase
        .from('paper_orders')
        .select('*', { count: 'exact', head: true })
        .eq('generation_id', genId || '')
        .eq('status', 'filled')
        .not('tags->test_mode', 'eq', true);

      // Get unique agents
      const { data: agentData } = await supabase
        .from('paper_orders')
        .select('agent_id')
        .eq('generation_id', genId || '')
        .eq('status', 'filled')
        .not('tags->test_mode', 'eq', true);

      const uniqueAgents = new Set(agentData?.map(o => o.agent_id).filter(Boolean)).size;

      // Get unique symbols
      const { data: symbolData } = await supabase
        .from('paper_orders')
        .select('symbol')
        .eq('generation_id', genId || '')
        .eq('status', 'filled');

      const uniqueSymbols = new Set(symbolData?.map(o => o.symbol)).size;

      // Get open positions
      const { data: positions } = await supabase
        .from('paper_positions')
        .select('qty, avg_entry_price, symbol');

      const openPositions = positions?.filter(p => Math.abs(p.qty) > 0.0001) || [];
      const totalNotional = openPositions.reduce((sum, p) => sum + Math.abs(p.qty * p.avg_entry_price), 0);

      // Get cash
      const { data: account } = await supabase
        .from('paper_accounts')
        .select('cash, starting_cash')
        .single();

      const cash = account?.cash || 0;
      const startingCash = account?.starting_cash || 1000;
      const equity = cash + totalNotional;
      const drawdownPct = ((startingCash - equity) / startingCash) * 100;

      return {
        timestamp: new Date().toISOString(),
        generation_id: genId || 'unknown',
        generation_number: gen?.generation_number || 0,
        hours_elapsed: Math.round(hoursElapsed * 10) / 10,
        learnable_fills: fillsCount || 0,
        unique_agents: uniqueAgents,
        unique_symbols: uniqueSymbols,
        open_positions: openPositions.length,
        total_notional: Math.round(totalNotional * 100) / 100,
        cash: Math.round(cash * 100) / 100,
        equity: Math.round(equity * 100) / 100,
        drawdown_pct: Math.round(drawdownPct * 100) / 100,
      };
    },
    refetchInterval: 30000,
  });

  // Recent trades for verification
  const { data: recentTrades } = useQuery({
    queryKey: ['rollover-recent-trades'],
    queryFn: async () => {
      const { data } = await supabase
        .from('control_events')
        .select('triggered_at, action, metadata')
        .in('action', ['trade_executed', 'trade_blocked'])
        .order('triggered_at', { ascending: false })
        .limit(20);
      return data || [];
    },
    refetchInterval: 30000,
  });

  // Cohort verification
  const { data: cohortCount } = useQuery({
    queryKey: ['rollover-cohort'],
    queryFn: async () => {
      const { data: state } = await supabase
        .from('system_state')
        .select('current_generation_id')
        .single();

      const { count } = await supabase
        .from('generation_agents')
        .select('*', { count: 'exact', head: true })
        .eq('generation_id', state?.current_generation_id || '');

      return count || 0;
    },
    refetchInterval: 60000,
  });

  const saveSnapshot = () => {
    if (snapshot) {
      setSavedSnapshot(snapshot);
      // Also log to console for manual backup
      console.log('[ROLLOVER SNAPSHOT]', JSON.stringify(snapshot, null, 2));
    }
  };

  const exportSnapshot = () => {
    if (!snapshot) return;
    const blob = new Blob([JSON.stringify({ snapshot, recentTrades, cohortCount }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rollover-snapshot-gen${snapshot.generation_number}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <Card className="bg-card/50 backdrop-blur border-border/50">
        <CardContent className="p-4">
          <div className="text-xs text-muted-foreground font-mono">Loading snapshot...</div>
        </CardContent>
      </Card>
    );
  }

  const progressPct = snapshot ? Math.min(100, (snapshot.learnable_fills / 100) * 100) : 0;
  const timeProgressPct = snapshot ? Math.min(100, (snapshot.hours_elapsed / 168) * 100) : 0; // 7 days = 168 hours

  // Check for cohort integrity failure
  const cohortIntegrityFailed = cohortCount !== null && cohortCount !== 100;

  return (
    <Card className="bg-card/50 backdrop-blur border-border/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="font-mono text-sm text-muted-foreground uppercase tracking-wider">
            Rollover Postmortem Checklist
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => refetch()} className="h-6 px-2">
              <RefreshCw className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="sm" onClick={exportSnapshot} className="h-6 px-2">
              <Download className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* CRITICAL: Cohort Integrity Blocker */}
        {cohortIntegrityFailed && (
          <div className="mb-3 p-2 rounded-md bg-destructive/20 border border-destructive/50">
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-destructive" />
              <span className="font-mono text-xs text-destructive font-bold">BLOCKER: COHORT INTEGRITY FAILED</span>
            </div>
            <p className="text-[10px] text-destructive/80 mt-1 font-mono">
              Expected 100 agents, found {cohortCount}. Breeding may have failed to create offspring.
              Check control_events for 'rollover_failed' or 'offspring_shortfall'.
            </p>
          </div>
        )}
        
        <ScrollArea className="h-[400px] pr-2">
          {/* Section A: Pre-Rollover Snapshot */}
          <Section title="A. Pre-Rollover Snapshot" badge={savedSnapshot ? 'SAVED' : 'LIVE'} defaultOpen={true}>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] font-mono mb-2">
              <div className="text-muted-foreground">Generation</div>
              <div>#{snapshot?.generation_number} ({snapshot?.generation_id?.slice(0, 8)}...)</div>
              
              <div className="text-muted-foreground">Hours Elapsed</div>
              <div>{snapshot?.hours_elapsed}h / 168h</div>
              
              <div className="text-muted-foreground">Learnable Fills</div>
              <div className={cn(snapshot?.learnable_fills && snapshot.learnable_fills >= 100 ? 'text-green-500' : '')}>
                {snapshot?.learnable_fills} / 100
              </div>
              
              <div className="text-muted-foreground">Unique Agents</div>
              <div>{snapshot?.unique_agents}</div>
              
              <div className="text-muted-foreground">Unique Symbols</div>
              <div>{snapshot?.unique_symbols}</div>
              
              <div className="text-muted-foreground">Open Positions</div>
              <div className={cn(snapshot?.open_positions && snapshot.open_positions > 0 ? 'text-yellow-500' : 'text-green-500')}>
                {snapshot?.open_positions}
              </div>
              
              <div className="text-muted-foreground">Notional Exposure</div>
              <div>${snapshot?.total_notional}</div>
              
              <div className="text-muted-foreground">Cash</div>
              <div>${snapshot?.cash}</div>
              
              <div className="text-muted-foreground">Equity</div>
              <div>${snapshot?.equity}</div>
              
              <div className="text-muted-foreground">Drawdown</div>
              <div className={cn(snapshot?.drawdown_pct && snapshot.drawdown_pct > 15 ? 'text-red-500' : '')}>
                {snapshot?.drawdown_pct}%
              </div>
            </div>

            {/* Progress bars */}
            <div className="space-y-1 mb-2">
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-muted-foreground w-12">Trades</span>
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div 
                    className={cn("h-full transition-all", progressPct >= 100 ? "bg-green-500" : "bg-primary")}
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <span className="text-[9px] font-mono w-8">{Math.round(progressPct)}%</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-muted-foreground w-12">Time</span>
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-500 transition-all"
                    style={{ width: `${timeProgressPct}%` }}
                  />
                </div>
                <span className="text-[9px] font-mono w-8">{Math.round(timeProgressPct)}%</span>
              </div>
            </div>

            <Button 
              variant="outline" 
              size="sm" 
              onClick={saveSnapshot}
              className="w-full h-6 text-[10px]"
            >
              {savedSnapshot ? 'Re-save Snapshot' : 'Save Pre-Rollover Snapshot'}
            </Button>
          </Section>

          {/* Section B: Trigger Event */}
          <Section title="B. Rollover Trigger Event" badge="PENDING">
            <div className="text-[10px] text-muted-foreground font-mono mb-2">
              Monitor for first condition to trigger:
            </div>
            <CheckItem 
              label="100 learnable trades reached" 
              status={snapshot?.learnable_fills && snapshot.learnable_fills >= 100 ? 'pass' : 'pending'}
              detail={`${snapshot?.learnable_fills || 0} / 100`}
            />
            <CheckItem 
              label="7 days elapsed" 
              status={snapshot?.hours_elapsed && snapshot.hours_elapsed >= 168 ? 'pass' : 'pending'}
              detail={`${snapshot?.hours_elapsed || 0}h / 168h`}
            />
            <CheckItem 
              label="15% drawdown breached" 
              status={snapshot?.drawdown_pct && snapshot.drawdown_pct >= 15 ? 'fail' : 'pending'}
              detail={`${snapshot?.drawdown_pct || 0}% / 15%`}
            />
          </Section>

          {/* Section C: Forced Liquidation */}
          <Section title="C. Forced Liquidation Verification" badge="POST-TRIGGER">
            <div className="text-[10px] text-muted-foreground font-mono mb-2">
              Verify after rollover triggers:
            </div>
            <CheckItem 
              label="All positions closed (count = 0)" 
              status={snapshot?.open_positions === 0 ? 'pass' : 'pending'}
              detail={`Current: ${snapshot?.open_positions} open`}
            />
            <CheckItem 
              label="Every close has matching order + fill" 
              status="unknown"
              detail="Manual verification required"
            />
            <CheckItem 
              label="No orphan positions" 
              status="unknown"
              detail="Check positions table empty"
            />
            <CheckItem 
              label="Equity matches cash post-liquidation" 
              status="unknown"
              detail="± fees/slippage tolerance"
            />
          </Section>

          {/* Section D: Selection & Breeding */}
          <Section title="D. Selection & Breeding Integrity" badge="POST-TRIGGER">
            <CheckItem 
              label="Top 10% marked elite (unchanged genes)" 
              status="unknown"
              detail="10 agents should be elite"
            />
            <CheckItem 
              label="Next 15% used as parents" 
              status="unknown"
              detail="15 agents as breeding parents"
            />
            <CheckItem 
              label="Bottom 75% removed" 
              status="unknown"
              detail="75 agents pruned"
            />
            <CheckItem 
              label="Offspring restores total to 100" 
              status="unknown"
              detail="Check cohort count"
            />
            <CheckItem 
              label="Mutation within configured bounds" 
              status="unknown"
              detail="±5-15% per gene"
            />
          </Section>

          {/* Section E: Gen 11 Boot */}
          <Section title="E. Gen 11 Boot Correctness" badge="POST-TRIGGER">
            <CheckItem 
              label="system_state.current_generation_id updated" 
              status="unknown"
              detail="Should be new UUID"
            />
            <CheckItem 
              label="generation_agents has 100 rows for Gen 11" 
              status={cohortCount === 100 ? 'pass' : cohortCount !== null ? 'fail' : 'pending'}
              detail={`Current cohort: ${cohortCount}${cohortIntegrityFailed ? ' ⚠️ CRITICAL' : ''}`}
            />
            <CheckItem 
              label="Trade-cycle writes to Gen 11" 
              status="unknown"
              detail="Check new orders have correct gen_id"
            />
            <CheckItem 
              label="No orders created under Gen 10 after rollover" 
              status="unknown"
              detail="Manual verification required"
            />
          </Section>

          {/* Section F: 30-Minute Health Check */}
          <Section title="F. Post-Rollover 30min Health Check" badge="POST-TRIGGER">
            <CheckItem 
              label="market-poll still updating" 
              status="unknown"
              detail="Check market_data.updated_at"
            />
            <CheckItem 
              label="trade-cycle still running" 
              status="unknown"
              detail="Check control_events for decisions"
            />
            <CheckItem 
              label="fitness-calc still scoring" 
              status="unknown"
              detail="Check performance table"
            />
            <CheckItem 
              label="No spike in trade_blocked" 
              status="unknown"
              detail="Compare to baseline"
            />
            <CheckItem 
              label="No system_status = error" 
              status="unknown"
              detail="Check system_state"
            />
          </Section>

          {/* Recent Trades Reference */}
          <Section title="Recent Trades (Last 20)" badge={`${recentTrades?.length || 0}`}>
            <div className="space-y-1">
              {recentTrades?.slice(0, 10).map((t, i) => (
                <div key={i} className="text-[9px] font-mono flex items-center gap-2">
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "text-[8px] px-1",
                      t.action === 'trade_executed' ? 'text-green-500' : 'text-red-500'
                    )}
                  >
                    {t.action === 'trade_executed' ? 'EXEC' : 'BLOCK'}
                  </Badge>
                  <span className="text-muted-foreground">
                    {new Date(t.triggered_at).toLocaleTimeString()}
                  </span>
                  <span className="truncate">
                    {(t.metadata as any)?.symbol || 'unknown'}
                  </span>
                </div>
              ))}
            </div>
          </Section>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
