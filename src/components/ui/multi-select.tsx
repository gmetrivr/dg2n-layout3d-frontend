import * as React from "react";
import { useState, useRef, useEffect } from "react";
import { cn } from "@/shadcn/lib/utils";
import { Check, ChevronDown } from "lucide-react";

interface MultiSelectProps {
  options: { value: string; label: string }[];
  value: string[];
  onChange: (value: string[]) => void;
  className?: string;
  allOption?: { value: string; label: string };
}

export const MultiSelect = React.forwardRef<HTMLDivElement, MultiSelectProps>(
  ({ options, value, onChange, className, allOption = { value: "all", label: "All" } }, ref) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
          setIsOpen(false);
        }
      };

      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleToggle = () => {
      setIsOpen(!isOpen);
    };

    const handleSelect = (optionValue: string) => {
      if (optionValue === allOption.value) {
        // If "All" is selected, clear all other selections
        onChange([allOption.value]);
      } else {
        // Remove "all" if it's in the array
        const filteredValue = value.filter(v => v !== allOption.value);

        if (filteredValue.includes(optionValue)) {
          // Remove the value
          const newValue = filteredValue.filter(v => v !== optionValue);
          // If no values left, default to "all"
          onChange(newValue.length === 0 ? [allOption.value] : newValue);
        } else {
          // Add the value
          onChange([...filteredValue, optionValue]);
        }
      }
    };

    const isAllSelected = value.includes(allOption.value) || value.length === 0;
    const displayValue = isAllSelected
      ? allOption.label
      : value.length === 1
        ? options.find(opt => opt.value === value[0])?.label || value[0]
        : `${value.length} selected`;

    return (
      <div ref={containerRef} className="relative w-full">
        <div
          ref={ref as any}
          className={cn(
            "flex min-h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background cursor-pointer hover:bg-accent/10",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            className
          )}
          onClick={handleToggle}
        >
          <div className="flex flex-wrap gap-1 flex-1">
            {isAllSelected ? (
              <span className="text-foreground">{displayValue}</span>
            ) : value.length === 1 ? (
              <span className="text-foreground">{displayValue}</span>
            ) : (
              <span className="text-foreground">{displayValue}</span>
            )}
          </div>
          <ChevronDown className={cn("h-4 w-4 opacity-50 transition-transform", isOpen && "transform rotate-180")} />
        </div>

        {isOpen && (
          <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover text-popover-foreground shadow-md">
            {/* All option */}
            <div
              className={cn(
                "relative flex cursor-pointer select-none items-center px-3 py-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                isAllSelected && "bg-accent/50"
              )}
              onClick={() => handleSelect(allOption.value)}
            >
              <div className="flex items-center gap-2 flex-1">
                <div className={cn("h-4 w-4 border rounded flex items-center justify-center", isAllSelected && "bg-primary border-primary")}>
                  {isAllSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                </div>
                <span>{allOption.label}</span>
              </div>
            </div>

            {/* Separator */}
            <div className="h-px bg-border my-1" />

            {/* Other options */}
            {options.map((option) => {
              const isSelected = value.includes(option.value) && !isAllSelected;
              return (
                <div
                  key={option.value}
                  className={cn(
                    "relative flex cursor-pointer select-none items-center px-3 py-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                    isSelected && "bg-accent/50"
                  )}
                  onClick={() => handleSelect(option.value)}
                >
                  <div className="flex items-center gap-2 flex-1">
                    <div className={cn("h-4 w-4 border rounded flex items-center justify-center", isSelected && "bg-primary border-primary")}>
                      {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                    </div>
                    <span>{option.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }
);

MultiSelect.displayName = "MultiSelect";
