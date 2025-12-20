import { X, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

const CARD_HEIGHT = 240;

interface CardData {
  id: string;
  title: string;
  type: 'cockpit' | 'drillable';
  drilldownPath?: string;
  component: React.ComponentType<{ compact?: boolean }>;
}

interface GridSlotProps {
  row: number;
  col: 'A' | 'B';
  card: CardData | null;
  isArmed: boolean;
  onArmSlot: () => void;
  onRemoveCard: () => void;
}

export function GridSlot({ row, col, card, isArmed, onArmSlot, onRemoveCard }: GridSlotProps) {
  const navigate = useNavigate();
  
  // Empty slot
  if (!card) {
    return (
      <div
        onClick={onArmSlot}
        className={cn(
          "w-full rounded-xl border-2 border-dashed cursor-pointer transition-all flex items-center justify-center",
          isArmed 
            ? "border-primary bg-primary/10 ring-2 ring-primary/30" 
            : "border-border/40 hover:border-primary/50 hover:bg-muted/30"
        )}
        style={{ height: CARD_HEIGHT }}
      >
        <div className="text-center text-muted-foreground">
          <Plus className={cn(
            "h-6 w-6 mx-auto mb-1",
            isArmed && "text-primary"
          )} />
          <span className={cn(
            "text-xs font-mono uppercase",
            isArmed && "text-primary"
          )}>
            {isArmed ? 'Ready for card' : 'Click to place'}
          </span>
        </div>
      </div>
    );
  }
  
  // Filled slot
  const CardComponent = card.component;
  
  return (
    <Card 
      variant="default"
      className="w-full flex flex-col overflow-hidden relative group"
      style={{
        height: CARD_HEIGHT,
        minHeight: CARD_HEIGHT,
        maxHeight: CARD_HEIGHT,
      }}
    >
      {/* Remove button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onRemoveCard}
        className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity z-10 bg-background/80 hover:bg-destructive hover:text-destructive-foreground"
      >
        <X className="h-3 w-3" />
      </Button>
      
      {/* Header */}
      <CardHeader className="flex-none py-2 px-3 border-b border-border/20 flex flex-row items-center justify-between">
        <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
          {card.title}
        </CardTitle>
        {card.type === 'drillable' && card.drilldownPath && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(card.drilldownPath!)}
            className="h-5 px-1.5 text-[10px] text-primary hover:text-primary/80"
          >
            View →
          </Button>
        )}
      </CardHeader>
      
      {/* Content with internal scroll */}
      <CardContent className="flex-1 min-h-0 overflow-y-auto px-3 py-2">
        <CardComponent compact />
      </CardContent>
    </Card>
  );
}
