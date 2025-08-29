/**
 * Get current time in IST
 */
export const getCurrentIST = (): Date => {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const ist = new Date(utc + (5.5 * 60 * 60000)); // IST is UTC+5:30
  return ist;
};

/**
 * Convert UTC date to IST
 */
export const convertUTCToIST = (utcDate: Date): Date => {
  const utc = utcDate.getTime() + (utcDate.getTimezoneOffset() * 60000);
  const ist = new Date(utc + (5.5 * 60 * 60000));
  return ist;
};

/**
 * Get start of today in IST
 */
export const getTodayStartIST = (): Date => {
  const now = getCurrentIST();
  now.setHours(0, 0, 0, 0);
  return now;
};

/**
 * Get end of today in IST
 */
export const getTodayEndIST = (): Date => {
  const now = getCurrentIST();
  now.setHours(23, 59, 59, 999);
  return now;
};

/**
 * Get date N days ago in IST
 */
export const getDaysAgoIST = (days: number): Date => {
  const now = getCurrentIST();
  now.setDate(now.getDate() - days);
  return now;
};