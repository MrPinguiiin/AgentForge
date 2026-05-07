import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Snippet } from "svelte";
import type { HTMLAttributes } from "svelte/elements";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Type helpers used by shadcn-svelte components
export type WithoutChildren<T> = T extends { children?: any }
  ? Omit<T, "children">
  : T;

export type WithoutChild<T> = T extends { child?: any }
  ? Omit<T, "child">
  : T;

export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;

export type WithElementRef<T, El extends HTMLElement = HTMLElement> = T & {
  ref?: El | null;
};
