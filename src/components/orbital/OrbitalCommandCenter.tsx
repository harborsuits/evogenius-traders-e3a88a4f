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
    <div className="h-screen flex flex-col overflow-hidden bg-background bg-grid">
      {/* Top Dock Zone */}
      <DockZone zone="top" />
      
      {/* Main Orbit Area */}
      <div className="flex-1 relative overflow-hidden">
        <OrbitRing />
        
        {/* Reset View Button */}
        <Button
          variant="outline"
          size="sm"
          className="absolute top-4 right-4 z-50"
          onClick={handleResetView}
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          Reset View
        </Button>
      </div>
      
      {/* Bottom Dock Zone */}
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
