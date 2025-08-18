// Backend: src/utils/medicationTimingUtils.ts

export interface MealTimes {
  breakfast: string; // "08:00"
  lunch: string;     // "13:00" 
  dinner: string;    // "20:00"
  snack?: string;    // "15:30"
}

export interface MedicationWindow {
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  mealTime: string;
  windowStart: string;
  windowEnd: string;
  isCurrentWindow: boolean;
}

export interface TimingValidation {
  canTake: boolean;
  reason: string;
  currentWindows: MedicationWindow[];
  nextWindow: MedicationWindow | null;
  timeUntilNextWindow: string | null;
}

// Convert time string to minutes for easier calculation
const timeToMinutes = (timeStr: string): number => {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
};

// Convert minutes back to time string
const minutesToTime = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
};

// Calculate window based on timing relation and meal time
const calculateWindow = (
  timingRelation: string,
  mealTime: string,
  mealTimes: MealTimes
): { start: string; end: string } => {
  const mealMinutes = timeToMinutes(mealTime);

  switch (timingRelation) {
    case 'after_food':
      return {
        start: minutesToTime(Math.max(0, mealMinutes - 60)),
        end: minutesToTime(mealMinutes + 150)
      };

    case 'before_food':
      return {
        start: minutesToTime(Math.max(0, mealMinutes - 120)),
        end: minutesToTime(mealMinutes + 60)
      };

    case 'with_food':
      return {
        start: minutesToTime(Math.max(0, mealMinutes - 60)),
        end: minutesToTime(mealMinutes + 60)
      };

    case 'empty_stomach':
      const allMeals = [
        { type: 'breakfast', time: mealTimes.breakfast },
        { type: 'lunch', time: mealTimes.lunch },
        { type: 'dinner', time: mealTimes.dinner }
      ].sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
      
      const currentMealIndex = allMeals.findIndex(meal => meal.time === mealTime);
      const previousMeal = allMeals[currentMealIndex - 1] || allMeals[allMeals.length - 1];
      const nextMeal = allMeals[currentMealIndex + 1] || allMeals[0];
      
      return {
        start: minutesToTime(timeToMinutes(previousMeal.time) + 150),
        end: minutesToTime(timeToMinutes(nextMeal.time) - 120)
      };

    case 'anytime':
    default:
      return {
        start: '00:00',
        end: '23:59'
      };
  }
};

// Get assigned meals based on frequency
export const getMealsForFrequency = (frequency: number): ('breakfast' | 'lunch' | 'dinner' | 'snack')[] => {
  switch (frequency) {
    case 1: return ['lunch'];
    case 2: return ['breakfast', 'dinner'];
    case 3: return ['breakfast', 'lunch', 'dinner'];
    case 4: return ['breakfast', 'lunch', 'dinner', 'snack'];
    default: return ['lunch'];
  }
};

// Calculate all medication windows
export const calculateMedicationWindows = (
  frequency: number,
  timingRelation: string,
  mealTimes: MealTimes
): MedicationWindow[] => {
  const assignedMeals = getMealsForFrequency(frequency);
  const windows: MedicationWindow[] = [];

  for (const mealType of assignedMeals) {
    const mealTime = mealTimes[mealType];
    if (!mealTime) continue;

    const window = calculateWindow(timingRelation, mealTime, mealTimes);
    
    windows.push({
      mealType,
      mealTime,
      windowStart: window.start,
      windowEnd: window.end,
      isCurrentWindow: false
    });
  }

  return windows;
};

// Check if current time is within a window
const isTimeInWindow = (currentTime: string, windowStart: string, windowEnd: string): boolean => {
  const current = timeToMinutes(currentTime);
  const start = timeToMinutes(windowStart);
  const end = timeToMinutes(windowEnd);

  // Handle overnight windows
  if (start > end) {
    return current >= start || current <= end;
  }
  
  return current >= start && current <= end;
};

// Main validation function
export const validateMedicationTiming = (
  frequency: number,
  timingRelation: string,
  mealTimes: MealTimes,
  currentTime?: string
): TimingValidation => {
  const now = currentTime || new Date().toLocaleTimeString('en-GB', { 
    hour12: false, 
    hour: '2-digit', 
    minute: '2-digit' 
  });

  // For anytime medications, always allow
  if (timingRelation === 'anytime') {
    return {
      canTake: true,
      reason: 'This medication can be taken at any time',
      currentWindows: [],
      nextWindow: null,
      timeUntilNextWindow: null
    };
  }

  const windows = calculateMedicationWindows(frequency, timingRelation, mealTimes);
  
  // Mark current windows
  const currentWindows = windows.filter(window => {
    const isCurrentWindow = isTimeInWindow(now, window.windowStart, window.windowEnd);
    window.isCurrentWindow = isCurrentWindow;
    return isCurrentWindow;
  });

  // If in any valid window, allow
  if (currentWindows.length > 0) {
    return {
      canTake: true,
      reason: `Perfect timing! Take with ${currentWindows[0].mealType}`,
      currentWindows,
      nextWindow: null,
      timeUntilNextWindow: null
    };
  }

  // Find next upcoming window
  const currentMinutes = timeToMinutes(now);
  let nextWindow: MedicationWindow | null = null;
  let shortestWait = Infinity;

  for (const window of windows) {
    const windowStartMinutes = timeToMinutes(window.windowStart);
    let waitTime = windowStartMinutes - currentMinutes;
    
    if (waitTime <= 0) {
      waitTime += 24 * 60;
    }
    
    if (waitTime < shortestWait) {
      shortestWait = waitTime;
      nextWindow = window;
    }
  }

  const timeUntilNext = nextWindow ? 
    `${Math.floor(shortestWait / 60)}h ${shortestWait % 60}m` : null;

  return {
    canTake: false,
    reason: `Not the right time. Next window: ${nextWindow?.mealType} (${nextWindow?.windowStart} - ${nextWindow?.windowEnd})`,
    currentWindows: [],
    nextWindow,
    timeUntilNextWindow: timeUntilNext
  };
};