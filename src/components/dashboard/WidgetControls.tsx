import { Button } from '@/components/ui/button';
import { 
  Maximize2, 
  Minimize2, 
  Pin, 
  PinOff, 
  ChevronDown,
  ChevronUp,
  X
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface WidgetControlsProps {
  isCollapsed?: boolean;
  isInOrbit?: boolean;
  onCollapse?: () => void;
  onDockToOrbit?: () => void;
  onUndock?: () => void;
  onPopout?: () => void;
  className?: string;
}

export function WidgetControls({
  isCollapsed,
  isInOrbit,
  onCollapse,
  onDockToOrbit,
  onUndock,
  onPopout,
  className,
}: WidgetControlsProps) {
  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      {/* Dock/Undock to Orbit */}
      {isInOrbit ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0 hover:bg-muted"
          onClick={onUndock}
          title="Undock to side"
        >
          <PinOff className="h-3 w-3 text-muted-foreground" />
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0 hover:bg-muted"
          onClick={onDockToOrbit}
          title="Dock to orbit"
        >
          <Pin className="h-3 w-3 text-muted-foreground" />
        </Button>
      )}
      
      {/* Pop out modal */}
      {onPopout && (
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0 hover:bg-muted"
          onClick={onPopout}
          title="Pop out"
        >
          <Maximize2 className="h-3 w-3 text-muted-foreground" />
        </Button>
      )}
      
      {/* Collapse/Expand */}
      {onCollapse && (
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0 hover:bg-muted"
          onClick={onCollapse}
          title={isCollapsed ? "Expand" : "Collapse"}
        >
          {isCollapsed ? (
            <ChevronUp className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          )}
        </Button>
      )}
    </div>
  );
}

// Collapsed tab component for side widgets
interface CollapsedTabProps {
  icon: React.ReactNode;
  label: string;
  count?: number;
  onClick: () => void;
  side: 'left' | 'right';
}

export function CollapsedTab({ icon, label, count, onClick, side }: CollapsedTabProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "absolute top-1/2 -translate-y-1/2 z-40",
        "flex items-center gap-1.5 px-2 py-3",
        "bg-card/95 backdrop-blur-sm border border-border/50",
        "rounded-lg shadow-lg cursor-pointer",
        "hover:bg-muted/50 transition-colors",
        "writing-mode-vertical",
        side === 'left' ? 'left-0 rounded-l-none' : 'right-0 rounded-r-none'
      )}
      style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
    >
      <span className="rotate-180 flex items-center gap-1.5">
        {icon}
        <span className="text-xs font-mono text-muted-foreground">{label}</span>
        {count !== undefined && count > 0 && (
          <span className="text-[10px] font-mono text-primary bg-primary/10 px-1 rounded">
            {count}
          </span>
        )}
      </span>
    </button>
  );
}
