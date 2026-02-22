import { useEffect, useRef, useCallback } from 'react';

interface UseAutoSaveOptions {
  version: number;
  onSave: () => void;
  delay?: number;
  enabled?: boolean;
}

export function useAutoSave({
  version,
  onSave,
  delay = 2000,
  enabled = true,
}: UseAutoSaveOptions) {
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedVersionRef = useRef<number>(version);

  const save = useCallback(() => {
    if (version !== lastSavedVersionRef.current) {
      onSave();
      lastSavedVersionRef.current = version;
    }
  }, [version, onSave]);

  useEffect(() => {
    if (!enabled) return;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(save, delay);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [version, delay, enabled, save]);

  const saveNow = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    save();
  }, [save]);

  return { saveNow };
}
