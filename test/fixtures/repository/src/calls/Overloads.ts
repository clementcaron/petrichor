export function overloaded(value: string): string;
export function overloaded(value: number): string;
export function overloaded(value: string | number): string {
  return String(value);
}
