export type SeatStatus = 'open' | 'nearly-full' | 'full';

/** Bucket remaining seats for display. Nearly full means within 10 percent of capacity (at least 2 seats). */
export function seatStatus(seatsAvailable: number, capacity: number): SeatStatus {
  if (seatsAvailable <= 0) return 'full';
  if (seatsAvailable <= Math.max(2, Math.ceil(capacity * 0.1))) return 'nearly-full';
  return 'open';
}
