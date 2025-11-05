import { z } from "zod";

// allow require usage in this module for conditional import of generated schemas
declare function require(path: string): unknown;

// Static TS shape for the form values. Keep this stable so other modules can import the type
// even if a generated schema is not present yet.
export type ProjectFormValues = {
  name: string;
  description?: string;
  theme_color?: string;
};

// Fallback schema used when no generated schema is available.
const fallbackSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().max(2000).optional(),
  theme_color: z
    .string()
    .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Invalid hex color")
    .optional(),
}) as z.ZodType<ProjectFormValues>;

// Try to load a generated schema from `src/schemas/generated/api-schemas` if the generator has run.
let generatedProjectSchema: z.ZodType<ProjectFormValues> | null = null;
try {
  const gen = require("./generated/api-schemas") as unknown;
  if (gen && typeof gen === "object") {
    const g = gen as Record<string, unknown>;
    if (g.projectSchema) {
      generatedProjectSchema = g.projectSchema as z.ZodType<ProjectFormValues>;
    } else if (g.components && typeof g.components === "object") {
      const comps = g.components as Record<string, unknown>;
      if (comps.schemas && typeof comps.schemas === "object") {
        const schemas = comps.schemas as Record<string, unknown>;
        if (schemas.Project) {
          generatedProjectSchema = schemas.Project as z.ZodType<ProjectFormValues>;
        }
      }
    }
  }
} catch {
  // ignore if generated file doesn't exist yet
}

export const projectSchema: z.ZodType<ProjectFormValues> = generatedProjectSchema ?? fallbackSchema;
