// "Time saved" is inherently a projection, not a measured value -- we only know
// actual automated run time, not how long the same coverage would have taken a
// human tester. These constants are a reasonable starting assumption (following
// the same "editable, clearly an estimate" pattern as packages/backend/src/agent/pricing.ts)
// -- tune them to your team's real manual-testing baseline and blended QA rate.
const ASSUMED_MANUAL_MINUTES_PER_TEST = 12;
const ASSUMED_HOURLY_RATE_USD = 75;

export interface TimeSavedEstimate {
  hours: number;
  usd: number;
}

/** `runCount` automated runs replacing an assumed manual pass each, minus the
 * actual automated time spent, floored at 0 (a project with very few/slow runs
 * shouldn't show a negative "time saved"). */
export function estimateTimeSaved(runCount: number, automatedDurationMs: number): TimeSavedEstimate {
  const manualMinutes = runCount * ASSUMED_MANUAL_MINUTES_PER_TEST;
  const automatedMinutes = automatedDurationMs / 60_000;
  const hours = Math.max(0, (manualMinutes - automatedMinutes) / 60);
  const usd = hours * ASSUMED_HOURLY_RATE_USD;
  return { hours: Math.round(hours * 10) / 10, usd: Math.round(usd) };
}
