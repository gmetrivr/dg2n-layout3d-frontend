import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from './button';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

interface DialogContentProps {
  children: React.ReactNode;
  className?: string;
}

interface DialogHeaderProps {
  children: React.ReactNode;
}

interface DialogTitleProps {
  children: React.ReactNode;
}

interface DialogDescriptionProps {
  children: React.ReactNode;
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  if (!open) return null;

  // Check if dark mode is active
  const isDark = document.documentElement.classList.contains('dark') ||
                 window.matchMedia('(prefers-color-scheme: dark)').matches;

  const dialogContent = (
    <div className={`fixed inset-0 z-[9999] flex items-center justify-center ${isDark ? 'dark' : ''}`}>
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );

  return createPortal(dialogContent, document.body);
}

export function DialogContent({ children, className = "" }: DialogContentProps) {
  return (
    <div className={`
      bg-background border border-border rounded-lg shadow-lg 
      w-full mx-4 max-h-[85vh] overflow-y-auto
      ${className}
    `}>
      {children}
    </div>
  );
}

export function DialogHeader({ children }: DialogHeaderProps) {
  return (
    <div className="flex items-center justify-between p-6 pb-4">
      {children}
    </div>
  );
}

export function DialogTitle({ children }: DialogTitleProps) {
  return (
    <h2 className="text-lg font-semibold text-foreground">
      {children}
    </h2>
  );
}

export function DialogDescription({ children }: DialogDescriptionProps) {
  return (
    <p className="text-sm text-muted-foreground mt-2">
      {children}
    </p>
  );
}

interface DialogCloseProps {
  onClick: () => void;
}

export function DialogClose({ onClick }: DialogCloseProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      className="h-6 w-6 p-0 text-foreground hover:text-foreground hover:bg-accent"
    >
      <X className="h-4 w-4" />
    </Button>
  );
}