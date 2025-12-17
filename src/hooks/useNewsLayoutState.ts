import { useState, useEffect, useCallback } from 'react';

export type WidgetPosition = 'side' | 'top' | 'bottom' | 'orbit' | 'collapsed';

interface NewsLayoutState {
  intake: WidgetPosition;
  autopsy: WidgetPosition;
}

const STORAGE_KEY = 'evotrader-news-layout';

const defaultState: NewsLayoutState = {
  intake: 'side',
  autopsy: 'side',
};

export function useNewsLayoutState() {
  const [state, setState] = useState<NewsLayoutState>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return { ...defaultState, ...JSON.parse(stored) };
      }
    } catch (e) {
      console.warn('Failed to load news layout state:', e);
    }
    return defaultState;
  });

  // Persist to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Failed to save news layout state:', e);
    }
  }, [state]);

  const setIntakePosition = useCallback((position: WidgetPosition) => {
    setState(prev => ({ ...prev, intake: position }));
  }, []);

  const setAutopsyPosition = useCallback((position: WidgetPosition) => {
    setState(prev => ({ ...prev, autopsy: position }));
  }, []);

  const toggleIntakeCollapse = useCallback(() => {
    setState(prev => ({
      ...prev,
      intake: prev.intake === 'collapsed' ? 'side' : 'collapsed',
    }));
  }, []);

  const toggleAutopsyCollapse = useCallback(() => {
    setState(prev => ({
      ...prev,
      autopsy: prev.autopsy === 'collapsed' ? 'side' : 'collapsed',
    }));
  }, []);

  const dockIntakeToOrbit = useCallback(() => {
    setState(prev => ({ ...prev, intake: 'orbit' }));
  }, []);

  const dockAutopsyToOrbit = useCallback(() => {
    setState(prev => ({ ...prev, autopsy: 'orbit' }));
  }, []);

  const undockIntake = useCallback(() => {
    setState(prev => ({ ...prev, intake: 'side' }));
  }, []);

  const undockAutopsy = useCallback(() => {
    setState(prev => ({ ...prev, autopsy: 'side' }));
  }, []);

  return {
    intakePosition: state.intake,
    autopsyPosition: state.autopsy,
    setIntakePosition,
    setAutopsyPosition,
    toggleIntakeCollapse,
    toggleAutopsyCollapse,
    dockIntakeToOrbit,
    dockAutopsyToOrbit,
    undockIntake,
    undockAutopsy,
  };
}
