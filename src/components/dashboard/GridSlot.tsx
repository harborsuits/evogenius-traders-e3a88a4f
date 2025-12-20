import { useState } from 'react';
import { X, Plus, Maximize2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
  const [expanded, setExpanded] = useState(false);
  
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
  
  const handleViewClick = () => {
    if (card.type === 'drillable' && card.drilldownPath) {
      navigate(card.drilldownPath);
    } else {
      setExpanded(true);
    }
  };
  
  return (
    <>
      <Card 
        variant="default"
        className="w-full flex flex-col overflow-hidden relative"
        style={{
          height: CARD_HEIGHT,
          minHeight: CARD_HEIGHT,
          maxHeight: CARD_HEIGHT,
        }}
      >
        {/* Header with controls */}
        <CardHeader className="flex-none py-2 px-3 border-b border-border/20 flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground truncate flex-1">
            {card.title}
          </CardTitle>
          
          <div className="flex items-center gap-1 shrink-0">
            {/* Expand/View button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleViewClick}
              className="h-6 w-6 text-muted-foreground hover:text-primary"
              title={card.drilldownPath ? "View full page" : "Expand"}
            >
              <Maximize2 className="h-3 w-3" />
            </Button>
            
            {/* Remove button - always visible */}
            <Button
              variant="ghost"
              size="icon"
              onClick={onRemoveCard}
              className="h-6 w-6 text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
              title="Return to Orbit"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </CardHeader>
        
        {/* Content with internal scroll */}
        <CardContent className="flex-1 min-h-0 overflow-y-auto px-3 py-2">
          <CardComponent compact />
        </CardContent>
      </Card>
      
      {/* Expanded view dialog (for cockpit cards without dedicated pages) */}
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="font-mono uppercase tracking-wider">
              {card.title}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto py-4">
            <CardComponent compact={false} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
