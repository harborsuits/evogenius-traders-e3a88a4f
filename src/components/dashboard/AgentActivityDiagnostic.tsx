import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useSystemState } from '@/hooks/useEvoTraderData';
import { useAgentActivityDiagnostic, type AgentActivity } from '@/hooks/useAgentActivityDiagnostic';
import { useCurrentTradeMode } from '@/contexts/TradeModeContext';
import { cn } from '@/lib/utils';
import { Users, Activity, AlertTriangle, TrendingUp, Lock } from 'lucide-react';

export function AgentActivityDiagnostic() {
  const { data: systemState } = useSystemState();
  const generationId = systemState?.current_generation_id || null;
  const { data: diagnostic, isLoading } = useAgentActivityDiagnostic(generationId);
  const { isLive, isLiveArmed } = useCurrentTradeMode();

  if (isLoading || !diagnostic) {
    return (
      <Card variant="terminal">
        <CardHeader className="pb-3">
          <CardTitle className="font-mono text-sm text-muted-foreground uppercase tracking-wider">
            Agent Activity Diagnostic
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">Loading diagnostic data...</p>
        </CardContent>
      </Card>
    );
  }

  const activityRate = 100 - diagnostic.inactive_rate;
  const isHealthy = activityRate >= 30;

  return (
    <Card variant="terminal">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="font-mono text-sm text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Agent Activity
          </CardTitle>
          <div className="flex items-center gap-2">
            {isLive && !isLiveArmed && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 flex items-center gap-1 text-amber-500 border-amber-500/50">
                <Lock className="h-3 w-3" />
                LOCKED
              </Badge>
            )}
            {isLive && isLiveArmed && (
              <Badge variant="glow" className="text-[10px] px-1.5 py-0.5 bg-amber-500/20 text-amber-400 border-amber-500/50">
                LIVE
              </Badge>
            )}
            <Badge variant={isHealthy ? 'default' : 'destructive'} className="text-xs">
              Gen {systemState?.current_generation_id?.substring(0, 4) || '—'} ({diagnostic?.total_agents || 0})
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Activity Distribution Bar */}
        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>Activity Distribution</span>
            <span>{diagnostic.total_agents} agents</span>
          </div>
          <div className="flex h-3 rounded-full overflow-hidden bg-muted/30">
            <div 
              className="bg-success" 
              style={{ width: `${(diagnostic.active_count / diagnostic.total_agents) * 100}%` }}
              title={`Active: ${diagnostic.active_count}`}
            />
            <div 
              className="bg-primary" 
              style={{ width: `${(diagnostic.moderate_activity_count / diagnostic.total_agents) * 100}%` }}
              title={`Moderate: ${diagnostic.moderate_activity_count}`}
            />
            <div 
              className="bg-warning" 
              style={{ width: `${(diagnostic.low_activity_count / diagnostic.total_agents) * 100}%` }}
              title={`Low: ${diagnostic.low_activity_count}`}
            />
            <div 
              className="bg-destructive/50" 
              style={{ width: `${(diagnostic.inactive_count / diagnostic.total_agents) * 100}%` }}
              title={`Inactive: ${diagnostic.inactive_count}`}
            />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-success" /> Active ({diagnostic.active_count})
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-primary" /> Mod ({diagnostic.moderate_activity_count})
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-warning" /> Low ({diagnostic.low_activity_count})
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-destructive/50" /> None ({diagnostic.inactive_count})
            </span>
          </div>
        </div>

        {/* Why Not Trading Breakdown */}
        <div>
          <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            Hold Reason Frequency (from recent cycles)
          </p>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(diagnostic.reasons)
              .filter(([_, count]) => count > 0)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 6)
              .map(([reason, count]) => (
                <div key={reason} className="flex items-center justify-between p-1.5 rounded bg-muted/20 text-xs">
                  <span className="text-muted-foreground truncate">
                    {reason.replace(/_/g, ' ')}
                  </span>
                  <span className="font-mono text-foreground">{count}</span>
                </div>
              ))}
          </div>
        </div>

        {/* Strategy Breakdown */}
        <div>
          <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
            <TrendingUp className="h-3 w-3" />
            Activity by Strategy
          </p>
          <div className="space-y-2">
            {Object.entries(diagnostic.by_strategy).map(([strategy, stats]) => {
              const activeRate = stats.total > 0 ? Math.round((stats.active / stats.total) * 100) : 0;
              return (
                <div key={strategy} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-24 truncate">
                    {strategy.replace(/_/g, ' ')}
                  </span>
                  <Progress value={activeRate} className="flex-1 h-2" />
                  <span className="text-xs font-mono w-16 text-right">
                    {stats.active}/{stats.total}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top Active Agents */}
        <div>
          <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
            <Users className="h-3 w-3" />
            Most Active Agents
          </p>
          <div className="space-y-1 max-h-24 overflow-y-auto">
            {diagnostic.agents.slice(0, 5).map((agent) => (
              <AgentRow key={agent.agent_id} agent={agent} />
            ))}
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground text-center">
          Read-only diagnostic • Does not affect trading behavior
        </p>
      </CardContent>
    </Card>
  );
}

function AgentRow({ agent }: { agent: AgentActivity }) {
  return (
    <div className="flex items-center justify-between p-1.5 rounded bg-muted/20 text-xs">
      <div className="flex items-center gap-2">
        <span className="font-mono text-foreground">
          {agent.agent_id.substring(0, 8)}
        </span>
        {agent.is_elite && (
          <Badge variant="outline" className="text-[10px] px-1 text-yellow-500 border-yellow-500/50">
            ELITE
          </Badge>
        )}
        <Badge variant="secondary" className="text-[10px] px-1">
          {agent.strategy_template.replace(/_/g, ' ')}
        </Badge>
      </div>
      <div className="flex items-center gap-2">
        <span className={cn(
          'font-mono',
          agent.trade_count > 0 ? 'text-success' : 'text-muted-foreground'
        )}>
          {agent.trade_count}t
        </span>
        <Badge 
          variant={
            agent.activity_bucket === 'active' ? 'default' :
            agent.activity_bucket === 'moderate' ? 'secondary' :
            agent.activity_bucket === 'low' ? 'outline' : 'destructive'
          }
          className="text-[10px] px-1"
        >
          {agent.activity_bucket}
        </Badge>
      </div>
    </div>
  );
}
