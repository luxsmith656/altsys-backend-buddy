import * as React from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  startOfWeek,
  endOfWeek,
  isSameMonth,
  isSameDay,
  isToday,
  isBefore,
  addMonths,
  startOfDay,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface DayCapacity {
  max_capacity: number;
  current_count: number;
  day_max_capacity?: number;
  night_max_capacity?: number;
  day_current_count?: number;
  night_current_count?: number;
}

export type DayCapacityMap = Record<string, DayCapacity>;

interface CapacityCalendarProps {
  selected: Date | undefined;
  onSelect: (date: Date | undefined) => void;
  groupSize: number;
  monthCapacity: DayCapacityMap;
  defaultMaxCapacity?: number;
  hikeType?: 'day' | 'night' | 'overnight' | string;
  onMonthChange: (year: number, month: number) => void;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const DEFAULT_MAX = 100;

export function CapacityCalendar({
  selected,
  onSelect,
  groupSize,
  monthCapacity,
  defaultMaxCapacity = DEFAULT_MAX,
  hikeType = 'day',
  onMonthChange,
}: CapacityCalendarProps) {
  const [currentMonth, setCurrentMonth] = React.useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const today = React.useMemo(() => startOfDay(new Date()), []);

  const calendarDays = React.useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calStart = startOfWeek(monthStart);
    const calEnd = endOfWeek(monthEnd);
    return eachDayOfInterval({ start: calStart, end: calEnd });
  }, [currentMonth]);

  const navigate = (dir: 1 | -1) => {
    const next = addMonths(currentMonth, dir);
    const newMonth = new Date(next.getFullYear(), next.getMonth(), 1);
    setCurrentMonth(newMonth);
    onMonthChange(next.getFullYear(), next.getMonth());
  };

  const getSlotInfo = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const cap = monthCapacity[dateStr];
    const totalMax = cap?.max_capacity ?? defaultMaxCapacity;

    let max: number;
    let current: number;

    if (hikeType === 'night' || hikeType === 'overnight') {
      max = cap?.night_max_capacity ?? Math.max(15, Math.round(totalMax * 0.35));
      current = cap?.night_current_count ?? 0;
    } else {
      max = cap?.day_max_capacity ?? Math.max(25, Math.round(totalMax * 0.65));
      current = cap?.day_current_count ?? 0;
    }

    const available = Math.max(0, max - current);
    return { available, max };
  };

  return (
    <div className="w-full select-none">
      {/* Month Navigation */}
      <div className="flex items-center justify-between mb-4 px-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(-1)}
          className="h-8 w-8 p-0 rounded-full hover:bg-primary/10"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-semibold tracking-wide">
          {format(currentMonth, 'MMMM yyyy')}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(1)}
          className="h-8 w-8 p-0 rounded-full hover:bg-primary/10"
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Weekday Headers */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="text-center text-[11px] font-semibold text-muted-foreground py-1"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day Grid */}
      <div className="grid grid-cols-7 gap-y-1">
        {calendarDays.map((day) => {
          const isPast = isBefore(startOfDay(day), today);
          const isCurrentMonth = isSameMonth(day, currentMonth);
          const isSelected = selected ? isSameDay(day, selected) : false;
          const isTodayDate = isToday(day);
          const { available, max } = getSlotInfo(day);

          const isFull = available === 0 || (isCurrentMonth && !isPast && available < groupSize);
          const isDisabled = isPast || !isCurrentMonth || isFull;

          const ratio = max > 0 ? available / max : 0;
          const slotStatus: 'good' | 'low' | 'full' =
            available === 0 ? 'full' :
            available < groupSize ? 'full' :
            ratio <= 0.3 ? 'low' : 'good';

          return (
            <button
              key={day.toISOString()}
              disabled={isDisabled}
              onClick={() => !isDisabled && onSelect(isSelected ? undefined : day)}
              className={cn(
                'relative flex flex-col items-center justify-center rounded-lg transition-all duration-150 min-h-[50px] sm:min-h-[56px] py-1',
                !isCurrentMonth && 'opacity-0 pointer-events-none',
                isDisabled && isCurrentMonth && 'opacity-35 cursor-not-allowed',
                !isDisabled && 'cursor-pointer',
                isSelected && 'bg-primary text-primary-foreground shadow-md scale-105 z-10',
                isTodayDate && !isSelected && 'bg-accent text-accent-foreground ring-2 ring-accent/60',
                !isSelected && !isTodayDate && !isDisabled && 'hover:bg-primary/10 hover:scale-105',
              )}
              aria-label={`${format(day, 'MMMM d, yyyy')}${isCurrentMonth && !isPast ? `, ${available} slots available` : ''}`}
              aria-pressed={isSelected}
            >
              <span className="text-xs sm:text-sm font-semibold leading-none mb-0.5">
                {format(day, 'd')}
              </span>
              {isCurrentMonth && !isPast && (
                <span
                  className={cn(
                    'text-[8px] sm:text-[9px] font-bold leading-none',
                    isSelected
                      ? 'text-primary-foreground/70'
                      : slotStatus === 'good'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : slotStatus === 'low'
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-red-500 dark:text-red-400',
                  )}
                >
                  {slotStatus === 'full' ? 'Full' : `${available}`}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 sm:gap-5 mt-4 pt-3 border-t border-border/20">
        {[
          { color: 'bg-emerald-500', label: 'Available' },
          { color: 'bg-amber-500', label: 'Almost full' },
          { color: 'bg-red-500', label: 'Full / Insufficient' },
          { color: 'bg-accent', label: 'Today' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className={cn('w-2 h-2 rounded-full flex-shrink-0', color)} />
            <span className="text-[10px] text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
