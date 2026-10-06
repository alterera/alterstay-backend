/** Common rate plan names used across properties. Custom names are still allowed. */
export const RATE_PLAN_NAME_PRESETS = [
  'Room Only',
  'Breakfast Included',
  'Breakfast + Dinner',
  'All Meals & Extras',
] as const;

export type RatePlanNamePreset = (typeof RATE_PLAN_NAME_PRESETS)[number];
