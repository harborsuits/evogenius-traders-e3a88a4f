// Baseline Invariants Check (dev-only)
// Verifies orbital framework non-regression requirements

import { useEffect, useCallback } from 'react';

// Expected baseline constants
const ORBIT_CARD_W = 380;
const ORBIT_CARD_H = 300;

export function useBaselineInvariants() {
  const checkInvariants = useCallback(() => {
    // Only run in development
    if (import.meta.env.PROD) return;

    const warnings: string[] = [];

    // 1. Check orbit card wrapper dimensions
    const orbitCards = document.querySelectorAll('[data-orbital-card]');
    orbitCards.forEach((card, index) => {
      const rect = card.getBoundingClientRect();
      const style = window.getComputedStyle(card);
      const minW = parseFloat(style.minWidth);
      const maxW = parseFloat(style.maxWidth);
      const minH = parseFloat(style.minHeight);
      const maxH = parseFloat(style.maxHeight);
      
      // Check that dimensions are locked at 380x300
      if (Math.abs(rect.width - ORBIT_CARD_W) > 2) {
        warnings.push(`[BASELINE] Orbit card ${index} width=${rect.width}, expected ${ORBIT_CARD_W}`);
      }
      if (Math.abs(rect.height - ORBIT_CARD_H) > 2) {
        warnings.push(`[BASELINE] Orbit card ${index} height=${rect.height}, expected ${ORBIT_CARD_H}`);
      }
      if (minW !== ORBIT_CARD_W || maxW !== ORBIT_CARD_W) {
        warnings.push(`[BASELINE] Orbit card ${index} has unlocked width constraints`);
      }
      if (minH !== ORBIT_CARD_H || maxH !== ORBIT_CARD_H) {
        warnings.push(`[BASELINE] Orbit card ${index} has unlocked height constraints`);
      }
    });

    // 2. Check dock zones reserve layout space (not overlaying orbit)
    const topDock = document.querySelector('[data-dock-zone="top"]');
    const bottomDock = document.querySelector('[data-dock-zone="bottom"]');
    const orbitStage = document.querySelector('[data-orbit-stage]');
    
    if (topDock && orbitStage) {
      const topDockRect = topDock.getBoundingClientRect();
      const orbitRect = orbitStage.getBoundingClientRect();
      
      // Orbit should not render under top dock
      if (orbitRect.top < topDockRect.bottom - 5) {
        warnings.push(`[BASELINE] Orbit renders under top dock (orbit.top=${orbitRect.top}, dock.bottom=${topDockRect.bottom})`);
      }
    }
    
    if (bottomDock && orbitStage) {
      const bottomDockRect = bottomDock.getBoundingClientRect();
      const orbitRect = orbitStage.getBoundingClientRect();
      
      // Orbit should not render under bottom dock
      if (orbitRect.bottom > bottomDockRect.top + 5) {
        warnings.push(`[BASELINE] Orbit renders under bottom dock (orbit.bottom=${orbitRect.bottom}, dock.top=${bottomDockRect.top})`);
      }
    }

    // 3. Check docked cards have sticky header and scrollable body
    const dockedCards = document.querySelectorAll('[data-docked-card]');
    dockedCards.forEach((card, index) => {
      const header = card.querySelector('[data-card-header]');
      const body = card.querySelector('[data-card-body]');
      
      if (header) {
        const headerStyle = window.getComputedStyle(header);
        // Header should have fixed height and shrink-0
        if (headerStyle.flexShrink !== '0') {
          warnings.push(`[BASELINE] Docked card ${index} header is not flex-shrink-0 (sticky)`);
        }
      }
      
      if (body) {
        const bodyStyle = window.getComputedStyle(body);
        // Body should have overflow-y: auto
        if (bodyStyle.overflowY !== 'auto') {
          warnings.push(`[BASELINE] Docked card ${index} body overflow-y=${bodyStyle.overflowY}, expected auto`);
        }
      }
    });

    // Log warnings
    if (warnings.length > 0) {
      console.warn('🚨 BASELINE INVARIANTS VIOLATED:');
      warnings.forEach(w => console.warn(w));
    }
  }, []);

  // Run check after layout settles
  useEffect(() => {
    // Only in development
    if (import.meta.env.PROD) return;

    // Check after initial render
    const timeout = setTimeout(checkInvariants, 1000);
    
    // Re-check on resize
    const handleResize = () => {
      setTimeout(checkInvariants, 200);
    };
    window.addEventListener('resize', handleResize);
    
    return () => {
      clearTimeout(timeout);
      window.removeEventListener('resize', handleResize);
    };
  }, [checkInvariants]);

  return { checkInvariants };
}
