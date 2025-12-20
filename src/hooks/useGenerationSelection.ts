import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useMemo, useCallback } from 'react';

interface GenerationOption {
  id: string;
  generation_number: number;
  start_time: string;
  end_time: string | null;
  is_active: boolean;
}

interface UseGenerationSelectionReturn {
  currentGenNumber: number | null;
  compareGenNumber: number | null;
  currentGenId: string | null;
  compareGenId: string | null;
  setCurrentGenNumber: (num: number) => void;
  setCompareGenNumber: (num: number) => void;
  resetDefault: () => void;
  generations: GenerationOption[];
  isLoading: boolean;
  defaultCurrentGenNumber: number | null;
  defaultCompareGenNumber: number | null;
}

export function useGenerationSelection(): UseGenerationSelectionReturn {
  const [searchParams, setSearchParams] = useSearchParams();

  // Fetch latest 50 generations
  const { data: generations = [], isLoading: gensLoading } = useQuery({
    queryKey: ['generations-list'],
    queryFn: async () => {
      const { data } = await supabase
        .from('generations')
        .select('id, generation_number, start_time, end_time, is_active')
        .order('generation_number', { ascending: false })
        .limit(50);
      return (data ?? []) as GenerationOption[];
    },
    refetchInterval: 30000,
  });

  // Fetch current system generation
  const { data: systemState, isLoading: sysLoading } = useQuery({
    queryKey: ['system-state-gen'],
    queryFn: async () => {
      const { data } = await supabase
        .from('system_state')
        .select('current_generation_id')
        .limit(1)
        .maybeSingle();
      return data;
    },
    refetchInterval: 30000,
  });

  const isLoading = gensLoading || sysLoading;

  // Find system's current generation number
  const defaultCurrentGen = useMemo(() => {
    if (!systemState?.current_generation_id || generations.length === 0) {
      return generations[0] ?? null;
    }
    return generations.find(g => g.id === systemState.current_generation_id) ?? generations[0] ?? null;
  }, [systemState, generations]);

  const defaultCurrentGenNumber = defaultCurrentGen?.generation_number ?? null;
  const defaultCompareGenNumber = defaultCurrentGenNumber !== null && defaultCurrentGenNumber > 1 
    ? defaultCurrentGenNumber - 1 
    : null;

  // Read from URL params, fallback to defaults
  const urlGenParam = searchParams.get('gen');
  const urlCompareParam = searchParams.get('compare');

  const currentGenNumber = useMemo(() => {
    if (urlGenParam !== null) {
      const parsed = parseInt(urlGenParam, 10);
      if (!isNaN(parsed) && generations.some(g => g.generation_number === parsed)) {
        return parsed;
      }
    }
    return defaultCurrentGenNumber;
  }, [urlGenParam, defaultCurrentGenNumber, generations]);

  const compareGenNumber = useMemo(() => {
    if (urlCompareParam !== null) {
      const parsed = parseInt(urlCompareParam, 10);
      if (!isNaN(parsed) && generations.some(g => g.generation_number === parsed)) {
        return parsed;
      }
    }
    // Auto-fallback to current-1
    if (currentGenNumber !== null && currentGenNumber > 1) {
      const prev = currentGenNumber - 1;
      if (generations.some(g => g.generation_number === prev)) {
        return prev;
      }
    }
    return null;
  }, [urlCompareParam, currentGenNumber, generations]);

  // Find IDs from numbers
  const currentGenId = useMemo(() => {
    if (currentGenNumber === null) return null;
    return generations.find(g => g.generation_number === currentGenNumber)?.id ?? null;
  }, [currentGenNumber, generations]);

  const compareGenId = useMemo(() => {
    if (compareGenNumber === null) return null;
    return generations.find(g => g.generation_number === compareGenNumber)?.id ?? null;
  }, [compareGenNumber, generations]);

  const setCurrentGenNumber = useCallback((num: number) => {
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev);
      newParams.set('gen', String(num));
      return newParams;
    }, { replace: true });
  }, [setSearchParams]);

  const setCompareGenNumber = useCallback((num: number) => {
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev);
      newParams.set('compare', String(num));
      return newParams;
    }, { replace: true });
  }, [setSearchParams]);

  const resetDefault = useCallback(() => {
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev);
      newParams.delete('gen');
      newParams.delete('compare');
      return newParams;
    }, { replace: true });
  }, [setSearchParams]);

  return {
    currentGenNumber,
    compareGenNumber,
    currentGenId,
    compareGenId,
    setCurrentGenNumber,
    setCompareGenNumber,
    resetDefault,
    generations,
    isLoading,
    defaultCurrentGenNumber,
    defaultCompareGenNumber,
  };
}
