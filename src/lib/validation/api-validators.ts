import { z } from "zod";

/**
 * Safe alphanumeric credential identifier schema.
 * Rejects path traversal, control characters, SQL injection tokens, and oversized strings.
 */
export const credentialIdSchema = z
  .string()
  .min(3, "Identifier must be at least 3 characters")
  .max(128, "Identifier cannot exceed 128 characters")
  .regex(/^[a-zA-Z0-9_\-\.:]+$/, "Invalid credential identifier format");

/**
 * URL-friendly organization tenant slug schema.
 */
export const tenantSlugSchema = z
  .string()
  .min(2, "Slug must be at least 2 characters")
  .max(64, "Slug cannot exceed 64 characters")
  .regex(/^[a-z0-9-]+$/, "Slug must only contain lowercase alphanumeric characters and hyphens");

/**
 * Audience origin validator for challenge nonces.
 * Must be a valid origin (scheme + host + optional port), HTTPS in production.
 */
export const audienceOriginSchema = z
  .string()
  .min(4, "Audience origin is required")
  .max(256, "Audience origin cannot exceed 256 characters")
  .refine((val) => {
    try {
      const url = new URL(val);
      const isLocal =
        url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
      return (
        (url.protocol === "https:" || isLocal) &&
        url.origin === val &&
        !url.username &&
        !url.password
      );
    } catch {
      return false;
    }
  }, "Audience must be a valid HTTPS origin (HTTP permitted only for localhost development)");

/**
 * Input validation for presentation verification requests.
 */
export const verifyPresentationSchema = z
  .object({
    credential: z.record(z.unknown()).optional(),
    presentation: z.record(z.unknown()).optional(),
    nonce: z.string().min(1).max(256).optional(),
  })
  .refine(
    (data) => Boolean(data.credential || data.presentation),
    "Request body must contain either a 'credential' or 'presentation' JSON object"
  );

/**
 * Sanitizes and validates path parameters for dynamic routes.
 */
export function validateParam<T>(param: unknown, schema: z.ZodSchema<T>): T {
  const result = schema.safeParse(param);
  if (!result.success) {
    const message = result.error.errors.map((e) => e.message).join(", ");
    throw new Error(`Validation Error: ${message}`);
  }
  return result.data;
}
