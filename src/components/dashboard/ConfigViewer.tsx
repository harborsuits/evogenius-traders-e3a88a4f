import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SystemConfig } from '@/types/evotrader';
import { Settings, DollarSign, Users, Clock, Shield } from 'lucide-react';

interface ConfigViewerProps {
  config: SystemConfig;
}

export function ConfigViewer({ config }: ConfigViewerProps) {
  const sections = [
    {
      title: 'Trading',
      icon: Clock,
      items: [
        { label: 'Symbols', value: config.trading.symbols.join(', ') },
        { label: 'Interval', value: `${config.trading.decision_interval_minutes}min` },
      ],
    },
    {
      title: 'Capital',
      icon: DollarSign,
      items: [
        { label: 'Total', value: `$${config.capital.total.toLocaleString()}` },
        { label: 'Active Pool', value: `${(config.capital.active_pool_pct * 100).toFixed(0)}%` },
      ],
    },
    {
      title: 'Population',
      icon: Users,
      items: [
        { label: 'Size', value: config.population.size.toString() },
        { label: 'Elites', value: config.population.elite_count.toString() },
        { label: 'Parents', value: config.population.parent_count.toString() },
      ],
    },
    {
      title: 'Generation',
      icon: Settings,
      items: [
        { label: 'Max Days', value: config.generation.max_days.toString() },
        { label: 'Max Trades', value: config.generation.max_trades.toString() },
        { label: 'Max DD', value: `${(config.generation.max_drawdown_pct * 100).toFixed(0)}%` },
      ],
    },
    {
      title: 'Risk',
      icon: Shield,
      items: [
        { label: 'Agent/Day', value: config.risk.max_trades_per_agent_per_day.toString() },
        { label: 'Symbol/Day', value: config.risk.max_trades_per_symbol_per_day.toString() },
      ],
    },
  ];

  return (
    <Card variant="default">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="font-mono text-sm text-muted-foreground uppercase tracking-wider">
            Configuration
          </CardTitle>
          <Badge variant="outline" className="text-xs font-mono">
            v1.0
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {sections.map((section) => (
          <div key={section.title} className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <section.icon className="h-3 w-3" />
              <span className="font-mono uppercase tracking-wider">{section.title}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {section.items.map((item) => (
                <div 
                  key={item.label}
                  className="flex items-center justify-between p-2 rounded bg-muted/30"
                >
                  <span className="text-xs text-muted-foreground">{item.label}</span>
                  <span className="font-mono text-xs text-foreground">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
