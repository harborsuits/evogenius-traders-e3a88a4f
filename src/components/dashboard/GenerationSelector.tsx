import { useGenerationSelection } from '@/hooks/useGenerationSelection';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RotateCcw, GitCompare, Layers } from 'lucide-react';

interface GenerationSelectorProps {
  onShowRotation?: () => void;
}

export function GenerationSelector({ onShowRotation }: GenerationSelectorProps) {
  const {
    currentGenNumber,
    compareGenNumber,
    setCurrentGenNumber,
    setCompareGenNumber,
    resetDefault,
    generations,
    isLoading,
    defaultCurrentGenNumber,
    defaultCompareGenNumber,
  } = useGenerationSelection();

  const isCustomSelection = 
    (currentGenNumber !== null && currentGenNumber !== defaultCurrentGenNumber) ||
    (compareGenNumber !== null && compareGenNumber !== defaultCompareGenNumber);

  if (isLoading || generations.length === 0) {
    return (
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <GitCompare className="h-3.5 w-3.5" />
        <span className="text-[10px] font-mono">Loading...</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0 h-5 border-border/50">
        <GitCompare className="h-2.5 w-2.5 mr-1" />
        Compare
      </Badge>

      {/* Current Gen Dropdown */}
      <Select
        value={currentGenNumber?.toString() ?? ''}
        onValueChange={(v) => setCurrentGenNumber(parseInt(v, 10))}
      >
        <SelectTrigger className="h-6 w-[70px] text-[10px] font-mono bg-background border-border/50 px-2">
          <SelectValue placeholder="Gen" />
        </SelectTrigger>
        <SelectContent className="bg-background border-border z-50">
          {generations.map((g) => (
            <SelectItem 
              key={g.id} 
              value={g.generation_number.toString()}
              className="text-[10px] font-mono"
            >
              Gen {g.generation_number}
              {g.is_active && <span className="ml-1 text-primary">●</span>}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <span className="text-[10px] text-muted-foreground">vs</span>

      {/* Compare Gen Dropdown */}
      <Select
        value={compareGenNumber?.toString() ?? ''}
        onValueChange={(v) => setCompareGenNumber(parseInt(v, 10))}
      >
        <SelectTrigger className="h-6 w-[70px] text-[10px] font-mono bg-background border-border/50 px-2">
          <SelectValue placeholder="Prev" />
        </SelectTrigger>
        <SelectContent className="bg-background border-border z-50">
          {generations
            .filter(g => g.generation_number !== currentGenNumber)
            .map((g) => (
              <SelectItem 
                key={g.id} 
                value={g.generation_number.toString()}
                className="text-[10px] font-mono"
              >
                Gen {g.generation_number}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>

      {/* Reset Button */}
      {isCustomSelection && (
        <Button
          variant="ghost"
          size="sm"
          onClick={resetDefault}
          className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
          title="Reset to current vs previous"
        >
          <RotateCcw className="h-3 w-3" />
        </Button>
      )}

      {/* Elite Rotation Button */}
      {onShowRotation && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onShowRotation}
          className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
          title="Show Elite Rotation"
        >
          <Layers className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
