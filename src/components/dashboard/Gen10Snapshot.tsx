import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// Hardcoded Gen 10 baseline snapshot - captured at rollover
const GEN_10_BASELINE = {
  generation: 10,
  captured_at: '2025-06-17T05:45:00Z',
  
  // Participation
  agents_participated: 19, // Agents with at least 1 trade (from earlier query showing ~19)
  total_cohort: 100,
  participation_rate: 19, // percentage
  
  // Trades
  total_learnable_trades: 100,
  
  // Exit efficiency
  total_exits: 58,
  early_exits: 8,
  good_exits: 50,
  exit_efficiency_rate: 86.2, // good_exits / total_exits * 100
  
  // Top 10 agents by fitness
  top_agents: [
    { id: 'aaaa0011', fitness: 0.06875, trades: 1, strategy: 'mean_reversion', is_elite: true },
    { id: 'aaaa0015', fitness: 0.068749, trades: 1, strategy: 'breakout', is_elite: true },
    { id: 'aaaa0031', fitness: 0.068748, trades: 1, strategy: 'trend_pullback', is_elite: true },
    { id: 'aaaa0061', fitness: 0.068748, trades: 1, strategy: 'trend_pullback', is_elite: true },
    { id: 'aaaa0004', fitness: 0.068748, trades: 1, strategy: 'mean_reversion', is_elite: true },
    { id: 'aaaa0019', fitness: 0.068746, trades: 1, strategy: 'trend_pullback', is_elite: true },
    { id: 'aaaa0039', fitness: 0.068746, trades: 1, strategy: 'breakout', is_elite: true },
    { id: 'aaaa0051', fitness: 0.068746, trades: 1, strategy: 'breakout', is_elite: true },
  ],
  
  // Strategy distribution among top performers
  strategy_breakdown: {
    trend_pullback: 4,
    breakout: 3,
    mean_reversion: 3,
  },
};

export function Gen10Snapshot() {
  const data = GEN_10_BASELINE;
  
  return (
    <Card variant="terminal">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="font-mono text-sm text-muted-foreground uppercase tracking-wider">
            Gen 10 Baseline Snapshot
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            ARCHIVED
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Participation */}
        <div className="grid grid-cols-3 gap-3">
          <div className="p-2 rounded bg-muted/30">
            <p className="text-xs text-muted-foreground">Participation</p>
            <p className="font-mono text-lg text-foreground">
              {data.agents_participated}/{data.total_cohort}
            </p>
            <p className="text-xs text-warning">{data.participation_rate}%</p>
          </div>
          <div className="p-2 rounded bg-muted/30">
            <p className="text-xs text-muted-foreground">Learnable Trades</p>
            <p className="font-mono text-lg text-foreground">{data.total_learnable_trades}</p>
          </div>
          <div className="p-2 rounded bg-muted/30">
            <p className="text-xs text-muted-foreground">Exit Efficiency</p>
            <p className="font-mono text-lg text-success">{data.exit_efficiency_rate}%</p>
            <p className="text-xs text-muted-foreground">{data.good_exits}/{data.total_exits} good</p>
          </div>
        </div>

        {/* Strategy Distribution */}
        <div>
          <p className="text-xs text-muted-foreground mb-2">Top Agent Strategies</p>
          <div className="flex gap-2">
            {Object.entries(data.strategy_breakdown).map(([strategy, count]) => (
              <Badge key={strategy} variant="secondary" className="text-xs">
                {strategy.replace('_', ' ')}: {count}
              </Badge>
            ))}
          </div>
        </div>

        {/* Top Agents */}
        <div>
          <p className="text-xs text-muted-foreground mb-2">Top 8 Elites (by fitness)</p>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {data.top_agents.map((agent, idx) => (
              <div 
                key={agent.id}
                className="flex items-center justify-between p-1.5 rounded bg-muted/20 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-muted-foreground w-4">{idx + 1}</span>
                  <span className="font-mono text-foreground">{agent.id}</span>
                  <Badge variant="outline" className="text-[10px] px-1">
                    {agent.strategy.replace('_', ' ')}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{agent.trades}t</span>
                  <span className={cn(
                    'font-mono',
                    agent.fitness > 0 ? 'text-success' : 'text-muted-foreground'
                  )}>
                    {(agent.fitness * 100).toFixed(2)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground text-center">
          Captured at rollover • Use to compare Gen 11 evolution
        </p>
      </CardContent>
    </Card>
  );
}
