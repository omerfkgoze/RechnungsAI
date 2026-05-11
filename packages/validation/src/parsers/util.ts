// Small helpers for navigating fxp output safely.
// fxp emits an object for a single child and an array for multiple. These
// helpers paper over that asymmetry so the projectors don't sprout `Array.isArray`
// branches.
//
// Element text value: fxp puts it under `#text` when the element has attributes,
// or as the element value directly when it doesn't. `text()` handles both.

import type { RawObj } from "../types.js";

export function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

export function child(node: unknown, key: string): unknown {
  if (node === null || typeof node !== "object") return undefined;
  return (node as RawObj)[key];
}

export function children(node: unknown, key: string): RawObj[] {
  const c = child(node, key);
  return asArray(c).filter(
    (v): v is RawObj => v !== null && typeof v === "object",
  );
}

/** Element's text content (handles `#text` when attributes are present). */
export function text(node: unknown): string | undefined {
  if (node === undefined || node === null) return undefined;
  if (typeof node === "string") {
    const trimmed = node.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof node === "number" || typeof node === "boolean") {
    return String(node);
  }
  if (typeof node === "object") {
    const v = (node as RawObj)["#text"];
    if (typeof v === "string") {
      const trimmed = v.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }
    if (typeof v === "number" || typeof v === "boolean") return String(v);
  }
  return undefined;
}

/** Read attribute (`@_name`). */
export function attr(node: unknown, name: string): string | undefined {
  if (node === null || typeof node !== "object") return undefined;
  const v = (node as RawObj)[`@_${name}`];
  if (typeof v === "string") {
    const trimmed = v.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return undefined;
}

/** Read the text of a child element by name. */
export function childText(node: unknown, key: string): string | undefined {
  return text(child(node, key));
}

export function firstChild(node: unknown, key: string): RawObj | undefined {
  const arr = children(node, key);
  return arr.length > 0 ? arr[0] : undefined;
}

/** Walk a dotted path of element names; returns undefined on any miss. */
export function path(node: unknown, ...keys: string[]): unknown {
  let cur: unknown = node;
  for (const k of keys) {
    cur = child(cur, k);
    if (cur === undefined) return undefined;
  }
  return cur;
}

export function pathText(node: unknown, ...keys: string[]): string | undefined {
  return text(path(node, ...keys));
}
