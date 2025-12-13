import { Generation } from '@/types/evotrader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer,
  CartesianGrid
} from 'recharts';

interface GenerationHistoryProps {
  generations: Generation[];
}

export function GenerationHistory({ generations }: GenerationHistoryProps) {
  const chartData = generations.map((gen) => ({
    name: `Gen ${gen.generation_number}`,
    pnl: gen.total_pnl,
    fitness: gen.avg_fitness ? gen.avg_fitness * 100 : 0,
    trades: gen.total_trades,
  }));

  const terminationLabels = {
    time: 'TIME',
    trades: 'TRADES',
    drawdown: 'DD',
  };

  return (
    <Card variant="terminal">
      <CardHeader className="pb-3">
        <CardTitle className="font-mono text-sm text-muted-foreground uppercase tracking-wider">
          Generation History
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Chart */}
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(175, 80%, 50%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(175, 80%, 50%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid 
                strokeDasharray="3 3" 
                stroke="hsl(220, 15%, 18%)" 
                vertical={false}
              />
              <XAxis 
                dataKey="name" 
                stroke="hsl(220, 10%, 50%)"
                fontSize={10}
                tickLine={false}
                axisLine={false}
              />
              <YAxis 
                stroke="hsl(220, 10%, 50%)"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `$${value}`}
              />
              <Tooltip 
                contentStyle={{
                  backgroundColor: 'hsl(220, 18%, 9%)',
                  border: '1px solid hsl(220, 15%, 18%)',
                  borderRadius: '8px',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '12px',
                }}
                labelStyle={{ color: 'hsl(180, 10%, 90%)' }}
              />
              <Area
                type="monotone"
                dataKey="pnl"
                stroke="hsl(175, 80%, 50%)"
                strokeWidth={2}
                fill="url(#pnlGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* History list */}
        <div className="space-y-2">
          {generations.slice().reverse().map((gen) => (
            <div 
              key={gen.id}
              className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-medium text-foreground">
                  Gen {gen.generation_number}
                </span>
                {gen.regime_tag && (
                  <Badge variant="outline" className="text-xs">
                    {gen.regime_tag}
                  </Badge>
                )}
              </div>
              
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className={cn(
                    'font-mono text-sm font-medium',
                    gen.total_pnl >= 0 ? 'text-success' : 'text-destructive'
                  )}>
                    {gen.total_pnl >= 0 ? '+' : ''}${gen.total_pnl.toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {gen.total_trades} trades
                  </p>
                </div>
                
                {gen.termination_reason && (
                  <Badge 
                    variant={gen.termination_reason === 'drawdown' ? 'destructive' : 'secondary'}
                    className="text-xs font-mono"
                  >
                    {terminationLabels[gen.termination_reason]}
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
