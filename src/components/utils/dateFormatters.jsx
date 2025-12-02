/**
 * Arizona Timezone Date Formatters
 * 
 * All interview-related timestamps should be displayed in Arizona local time (America/Phoenix).
 * Arizona does not observe Daylight Saving Time, so it's always MST (Mountain Standard Time).
 * 
 * USAGE:
 *   import { formatDateTimeAZ, formatDateAZ, formatTimeAZ } from '@/components/utils/dateFormatters';
 *   
 *   formatDateTimeAZ(session.created_date)  // "Dec 1, 2025, 3:13 PM MST"
 *   formatDateAZ(session.started_at)        // "Dec 1, 2025"
 *   formatTimeAZ(job.queued_at)             // "3:13 PM"
 */

const ARIZONA_TZ = 'America/Phoenix';

/**
 * Format a date/time value to Arizona local time with full date and time (no seconds).
 * Example output: "Dec 1, 2025, 3:13 PM MST"
 * 
 * @param {string|Date|number|null|undefined} value - ISO string, Date object, or timestamp
 * @returns {string} Formatted date-time string or 'N/A' if invalid
 */
export function formatDateTimeAZ(value) {
  if (!value) return 'N/A';
  
  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) return 'N/A';
    
    return date.toLocaleString('en-US', {
      timeZone: ARIZONA_TZ,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short'
    });
  } catch (err) {
    console.warn('[formatDateTimeAZ] Invalid date value:', value, err);
    return 'N/A';
  }
}

/**
 * Format a date/time value to Arizona local time with date only.
 * Example output: "Dec 1, 2025"
 * 
 * @param {string|Date|number|null|undefined} value - ISO string, Date object, or timestamp
 * @returns {string} Formatted date string or 'N/A' if invalid
 */
export function formatDateAZ(value) {
  if (!value) return 'N/A';
  
  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) return 'N/A';
    
    return date.toLocaleString('en-US', {
      timeZone: ARIZONA_TZ,
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch (err) {
    console.warn('[formatDateAZ] Invalid date value:', value, err);
    return 'N/A';
  }
}

/**
 * Format a date/time value to Arizona local time with time only (no seconds).
 * Example output: "3:13 PM"
 * 
 * @param {string|Date|number|null|undefined} value - ISO string, Date object, or timestamp
 * @returns {string} Formatted time string or 'N/A' if invalid
 */
export function formatTimeAZ(value) {
  if (!value) return 'N/A';
  
  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) return 'N/A';
    
    return date.toLocaleString('en-US', {
      timeZone: ARIZONA_TZ,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  } catch (err) {
    console.warn('[formatTimeAZ] Invalid date value:', value, err);
    return 'N/A';
  }
}

/**
 * Format a date/time value to Arizona local time with short date and time (no year).
 * Example output: "Dec 1, 3:13 PM"
 * 
 * @param {string|Date|number|null|undefined} value - ISO string, Date object, or timestamp
 * @returns {string} Formatted short date-time string or 'N/A' if invalid
 */
export function formatShortDateTimeAZ(value) {
  if (!value) return 'N/A';
  
  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) return 'N/A';
    
    return date.toLocaleString('en-US', {
      timeZone: ARIZONA_TZ,
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  } catch (err) {
    console.warn('[formatShortDateTimeAZ] Invalid date value:', value, err);
    return 'N/A';
  }
}

/**
 * Format a date/time value to Arizona local time with full date and time for reports.
 * Includes "at" separator for readability.
 * Example output: "Dec 1, 2025 at 3:13 PM MST"
 * 
 * @param {string|Date|number|null|undefined} value - ISO string, Date object, or timestamp
 * @returns {string} Formatted date-time string or 'N/A' if invalid
 */
export function formatDateTimeAZVerbose(value) {
  if (!value) return 'N/A';
  
  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) return 'N/A';
    
    const datePart = date.toLocaleString('en-US', {
      timeZone: ARIZONA_TZ,
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
    
    const timePart = date.toLocaleString('en-US', {
      timeZone: ARIZONA_TZ,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short'
    });
    
    return `${datePart} at ${timePart}`;
  } catch (err) {
    console.warn('[formatDateTimeAZVerbose] Invalid date value:', value, err);
    return 'N/A';
  }
}