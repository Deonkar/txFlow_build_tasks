'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FilterChipsProps {
  options: string[];
  selected: string[];
  onSelect: (value: string) => void;
  onDeselect: (value: string) => void;
  className?: string;
  variant?: 'default' | 'secondary' | 'outline';
}

export function FilterChips({
  options,
  selected,
  onSelect,
  onDeselect,
  className = '',
  variant = 'outline',
}: FilterChipsProps) {
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {options.map((option) => {
        const isSelected = selected.includes(option);
        return (
          <Badge
            key={option}
            variant={isSelected ? 'default' : variant}
            className={cn(
              'cursor-pointer transition-colors gap-1 px-3 py-1.5',
              isSelected && 'ring-2 ring-offset-2 ring-primary'
            )}
            onClick={() => {
              if (isSelected) {
                onDeselect(option);
              } else {
                onSelect(option);
              }
            }}
          >
            {option}
            {isSelected && (
              <X className="h-3 w-3 ml-1" />
            )}
          </Badge>
        );
      })}
    </div>
  );
}
