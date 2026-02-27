import { useRef, useState, useCallback } from 'react';

export interface Command {
  commandName: string;
  do(): void;
  undo(): void;
}

export function useUndoRedo() {
  const past = useRef<Command[]>([]);
  const future = useRef<Command[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const executeCommand = useCallback((cmd: Command) => {
    if (process.env.NODE_ENV === 'development') console.debug(`Execute: ${cmd.commandName}`);
    cmd.do();
    if (past.current.length >= 20) past.current.shift();
    past.current.push(cmd);
    future.current = [];
    setCanUndo(past.current.length > 0);
    setCanRedo(false);
  }, []);

  const handleUndo = useCallback(() => {
    const cmd = past.current.pop();
    if (!cmd) return;
    if (process.env.NODE_ENV === 'development') console.debug(`Undo: ${cmd.commandName}`);
    cmd.undo();
    future.current.push(cmd);
    setCanUndo(past.current.length > 0);
    setCanRedo(true);
  }, []);

  const handleRedo = useCallback(() => {
    const cmd = future.current.pop();
    if (!cmd) return;
    if (process.env.NODE_ENV === 'development') console.debug(`Redo: ${cmd.commandName}`);
    cmd.do();
    past.current.push(cmd);
    setCanUndo(true);
    setCanRedo(future.current.length > 0);
  }, []);

  return { executeCommand, handleUndo, handleRedo, canUndo, canRedo };
}
