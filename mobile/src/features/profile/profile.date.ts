const CIVIL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseCivilDate(value: string | null): Date | null {
  if (!value) return null;
  const match = CIVIL_DATE_PATTERN.exec(value);
  if (!match) return null;

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(year, month - 1, day, 12);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

export function formatCivilDate(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatCivilDateForDisplay(value: string | null): string | null {
  const date = parseCivilDate(value);
  if (!date) return null;
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12)));
}

export function getUtcTodayCivilDate(now = new Date()): string {
  const year = String(now.getUTCFullYear()).padStart(4, '0');
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getUtcTodayPickerDate(now = new Date()): Date {
  const [year, month, day] = getUtcTodayCivilDate(now).split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

export function isFutureCivilDate(value: string, now = new Date()): boolean {
  return value > getUtcTodayCivilDate(now);
}
