import { useEffect } from 'react';

export interface KeyboardShortcutHandlers {
  onCopy?: () => void;
  onPaste?: () => void;
  enabled?: boolean;
}

/**
 * Hook to handle keyboard shortcuts for copy/paste operations
 * Listens for Ctrl+C/Cmd+C and Ctrl+V/Cmd+V
 * Disabled when typing in input fields
 */
export function useKeyboardShortcuts(handlers: KeyboardShortcutHandlers) {
  useEffect(() => {
    if (handlers.enabled === false) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in input/textarea
      const target = e.target as HTMLElement;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable
      ) {
        return;
      }

      // Check for modifier key (Cmd on Mac, Ctrl on Windows/Linux)
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modKey = isMac ? e.metaKey : e.ctrlKey;

      // Copy: Ctrl+C / Cmd+C
      if (modKey && e.key === 'c' && handlers.onCopy) {
        e.preventDefault();
        handlers.onCopy();
      }

      // Paste: Ctrl+V / Cmd+V
      if (modKey && e.key === 'v' && handlers.onPaste) {
        e.preventDefault();
        handlers.onPaste();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlers]);
}
