import React from 'react';
import { OrbitalProvider, OrbitalCard } from '@/contexts/OrbitalContext';
import { OrbitRing } from './OrbitRing';
import { DockZone } from './DockZone';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';
import { useOrbital } from '@/contexts/OrbitalContext';

// Inner component that uses the context
function OrbitalLayout() {
  const { setRotationAngle } = useOrbital();
  
  const handleResetView = () => {
    setRotationAngle(0);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      {/* Top Dock Zone - fixed strip */}
      <DockZone zone="top" />
      
      {/* Main Orbit Area - centered, fills remaining space */}
      <div className="flex-1 relative overflow-hidden min-h-0">
        <OrbitRing />
        
        {/* Reset View Button */}
        <Button
          variant="outline"
          size="sm"
          className="absolute top-4 right-4 z-50 bg-card/80 backdrop-blur"
          onClick={handleResetView}
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          Reset
        </Button>
      </div>
      
      {/* Bottom Dock Zone - fixed strip */}
      <DockZone zone="bottom" />
    </div>
  );
}

interface OrbitalCommandCenterProps {
  cards: OrbitalCard[];
}

export function OrbitalCommandCenter({ cards }: OrbitalCommandCenterProps) {
  return (
    <OrbitalProvider cards={cards}>
      <OrbitalLayout />
    </OrbitalProvider>
  );
}
