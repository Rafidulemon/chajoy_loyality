/** Helpers for outlet opening hours, kept as minutes after midnight. */

/** 660 -> "11:00", the value format of <input type="time">. */
export function toTime(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

/** "11:00" -> 660 */
export function fromTime(time: string) {
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** 660 -> "11 AM", 1380 -> "11 PM", 630 -> "10:30 AM" */
export function hour12(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h % 12 || 12}${m ? ':' + String(m).padStart(2, '0') : ''} ${h < 12 ? 'AM' : 'PM'}`;
}
