import { isAxiosError } from "axios";

export type FieldErrors = Record<string, string[]>;

export function extractFieldErrorsFromAxios(err: unknown): FieldErrors | null {
  if (!isAxiosError(err) || !err.response) return null;
  const data = err.response.data;
  if (!data || typeof data !== "object") return null;

  // Common shapes: { fieldErrors: { field: ["msg"] } } or { errors: { field: ["msg"] } }
  const dataObj = data as Record<string, unknown>;
  if (dataObj.fieldErrors && typeof dataObj.fieldErrors === "object") {
    return dataObj.fieldErrors as FieldErrors;
  }
  if (dataObj.errors && typeof dataObj.errors === "object") {
    return dataObj.errors as FieldErrors;
  }

  // Fallback: look for top-level keys whose values are arrays of strings
  const result: FieldErrors = {};
  for (const [k, v] of Object.entries(dataObj)) {
    if (Array.isArray(v) && v.every((i) => typeof i === "string")) {
      result[k] = v as string[];
    }
  }
  if (Object.keys(result).length > 0) return result;

  return null;
}
