import { useMemo } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  className?: string;
  period?: string;
}

export function Sparkline({ data, width = 100, height = 24, className = '', period = 'All time' }: SparklineProps) {
  const { path, color, stats } = useMemo(() => {
    if (!data || data.length < 2) {
      return { path: '', color: 'hsl(var(--muted-foreground))', stats: null };
    }

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    
    // Padding for the line
    const padding = 2;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;
    
    // Build SVG path
    const points = data.map((value, index) => {
      const x = padding + (index / (data.length - 1)) * chartWidth;
      const y = padding + chartHeight - ((value - min) / range) * chartHeight;
      return `${x},${y}`;
    });
    
    const pathD = `M ${points.join(' L ')}`;
    
    // Determine color based on overall trend (first vs last)
    const first = data[0];
    const last = data[data.length - 1];
    let lineColor: string;
    
    if (last > first * 1.001) {
      lineColor = 'hsl(var(--success))';
    } else if (last < first * 0.999) {
      lineColor = 'hsl(var(--destructive))';
    } else {
      lineColor = 'hsl(var(--muted-foreground))';
    }
    
    return {
      path: pathD,
      color: lineColor,
      stats: {
        min,
        max,
        first,
        last,
        change: last - first,
        changePercent: first !== 0 ? ((last - first) / Math.abs(first)) * 100 : 0,
      },
    };
  }, [data, width, height]);

  if (!data || data.length < 2) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }

  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <svg
            width={width}
            height={height}
            className={`inline-block ${className}`}
            style={{ verticalAlign: 'middle' }}
          >
            <path
              d={path}
              fill="none"
              stroke={color}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs font-mono">
          <div className="space-y-1">
            <div className="text-muted-foreground">{period}</div>
            <div>Latest: <span className={stats!.last >= 0 ? 'text-success' : 'text-destructive'}>${stats!.last.toFixed(2)}</span></div>
            <div>Min: ${stats!.min.toFixed(2)} / Max: ${stats!.max.toFixed(2)}</div>
            <div>Change: <span className={stats!.change >= 0 ? 'text-success' : 'text-destructive'}>
              {stats!.change >= 0 ? '+' : ''}{stats!.change.toFixed(2)} ({stats!.changePercent.toFixed(1)}%)
            </span></div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
