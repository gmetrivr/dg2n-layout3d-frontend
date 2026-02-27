import { useEffect } from 'react';

export interface KeyboardShortcutHandlers {
  onCopy?: () => void;
  onPaste?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  enabled?: boolean;
}

/**
 * Hook to handle keyboard shortcuts for copy/paste and undo/redo operations.
 * Listens for Ctrl+C/Cmd+C, Ctrl+V/Cmd+V, Ctrl+Z/Cmd+Z, Ctrl+Y/Cmd+Shift+Z.
 * Disabled when typing in input fields (focus guard).
 */
export function useKeyboardShortcuts(handlers: KeyboardShortcutHandlers) {
  useEffect(() => {
    if (handlers.enabled === false) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Focus guard — don't intercept when a text input is focused
      if (document.activeElement?.closest('input, textarea, select, [contenteditable="true"]')) {
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

      // Undo: Ctrl+Z / Cmd+Z
      if (modKey && e.key === 'z' && !e.shiftKey && handlers.onUndo) {
        e.preventDefault();
        handlers.onUndo();
      }

      // Redo: Ctrl+Y / Cmd+Shift+Z
      if (handlers.onRedo) {
        const isRedo = (modKey && e.key === 'y') || (modKey && e.shiftKey && e.key === 'z') || (modKey && e.shiftKey && e.key === 'Z');
        if (isRedo) {
          e.preventDefault();
          handlers.onRedo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlers]);
}
