import { Agent, StrategyTemplate } from '@/types/evotrader';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface AgentGridProps {
  agents: Agent[];
  onAgentClick?: (agent: Agent) => void;
}

const strategyColors: Record<StrategyTemplate, string> = {
  trend_pullback: 'bg-strategy-trend',
  mean_reversion: 'bg-strategy-mean',
  breakout: 'bg-strategy-breakout',
};

const statusOpacity: Record<string, string> = {
  elite: 'ring-2 ring-status-elite ring-offset-1 ring-offset-background',
  active: '',
  probation: 'opacity-50',
  removed: 'opacity-20',
};

export function AgentGrid({ agents, onAgentClick }: AgentGridProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-sm text-muted-foreground uppercase tracking-wider">
          Agent Population ({agents.length})
        </h3>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-sm bg-strategy-trend" />
            <span className="text-muted-foreground">Trend</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-sm bg-strategy-mean" />
            <span className="text-muted-foreground">Mean Rev</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-sm bg-strategy-breakout" />
            <span className="text-muted-foreground">Breakout</span>
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-10 gap-1.5">
        {agents.map((agent) => (
          <Tooltip key={agent.id}>
            <TooltipTrigger asChild>
              <button
                onClick={() => onAgentClick?.(agent)}
                className={cn(
                  'aspect-square rounded-sm transition-all duration-200 hover:scale-110',
                  strategyColors[agent.strategy_template],
                  statusOpacity[agent.status],
                  'hover:shadow-glow'
                )}
              />
            </TooltipTrigger>
            <TooltipContent 
              side="top" 
              className="font-mono text-xs bg-popover border-border"
            >
              <div className="space-y-1">
                <p className="font-bold">{agent.id}</p>
                <p className="text-muted-foreground">{agent.strategy_template.replace('_', ' ')}</p>
                <p className="text-primary">${agent.capital_allocation}</p>
                {agent.is_elite && <p className="text-status-elite">★ Elite</p>}
              </div>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}
