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
    <div 
      className="w-screen h-screen relative overflow-hidden bg-black"
      style={{
        // Match prototype padding for orbit centering
        paddingTop: 360,
        paddingBottom: 480,
      }}
    >
      {/* Top Dock Zone - fixed at top */}
      <DockZone zone="top" />
      
      {/* Main Orbit Area */}
      <OrbitRing />
      
      {/* Bottom Dock Zone - fixed above controls */}
      <DockZone zone="bottom" />
      
      {/* Controls - fixed at bottom center */}
      <div 
        className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[1000] flex gap-3 px-6 py-4 rounded-full backdrop-blur-xl"
        style={{
          background: 'rgba(10, 10, 10, 0.9)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}
      >
        <Button
          variant="outline"
          size="sm"
          className="bg-primary/20 border-primary/40 text-primary hover:bg-primary/30"
          onClick={handleResetView}
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          Reset View
        </Button>
      </div>
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
