// DB weekday keys are 0=Sun..6=Sat (04-DATA-MODEL.sql). Presented Monday-first to match the
// default training week start.
export interface Weekday {
  index: number;
  short: string;
  long: string;
}

export const WEEKDAYS: Weekday[] = [
  { index: 1, short: 'Mon', long: 'Monday' },
  { index: 2, short: 'Tue', long: 'Tuesday' },
  { index: 3, short: 'Wed', long: 'Wednesday' },
  { index: 4, short: 'Thu', long: 'Thursday' },
  { index: 5, short: 'Fri', long: 'Friday' },
  { index: 6, short: 'Sat', long: 'Saturday' },
  { index: 0, short: 'Sun', long: 'Sunday' },
];
