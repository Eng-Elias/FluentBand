export type ClassValue = string | false | null | undefined;

export function clsx(...args: ClassValue[]): string {
  return args.filter(Boolean).join(" ");
}
