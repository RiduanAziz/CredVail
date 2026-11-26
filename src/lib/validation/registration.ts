import { z } from "zod";
import { passwordSchema, isPasswordTooSimilarToEmail } from "../auth/password-policy.ts";

export const CURRENT_TERMS_VERSION = "2026-11";
export const CURRENT_PRIVACY_VERSION = "2026-11";

export const ORGANIZATION_TYPES = [
  { value: "UNIVERSITY", label: "University / Higher Education Institution" },
  { value: "COLLEGE", label: "College" },
  { value: "SCHOOL", label: "School / Educational Institution" },
  { value: "TRAINING_CENTER", label: "Training and Certification Center" },
  { value: "PROFESSIONAL_ASSOCIATION", label: "Professional Association" },
  { value: "NGO", label: "Non-profit Organization / NGO" },
  { value: "GOVERNMENT", label: "Government / Public Institution" },
  { value: "ENTERPRISE", label: "Company / Enterprise" },
  { value: "CLUB", label: "Club / Community Organization" },
  { value: "OTHER", label: "Other" },
] as const;

export const ORGANIZATION_TYPE_VALUES = [
  "UNIVERSITY",
  "COLLEGE",
  "SCHOOL",
  "TRAINING_CENTER",
  "PROFESSIONAL_ASSOCIATION",
  "NGO",
  "GOVERNMENT",
  "ENTERPRISE",
  "CLUB",
  "OTHER",
] as const;

export type OrganizationTypeValue = (typeof ORGANIZATION_TYPE_VALUES)[number];

export const ISO_COUNTRIES = [
  { code: "US", name: "United States", postalLabel: "ZIP Code", regionLabel: "State" },
  { code: "GB", name: "United Kingdom", postalLabel: "Postcode", regionLabel: "County / Region" },
  { code: "CA", name: "Canada", postalLabel: "Postal Code", regionLabel: "Province / Territory" },
  { code: "AU", name: "Australia", postalLabel: "Postcode", regionLabel: "State / Territory" },
  { code: "DE", name: "Germany", postalLabel: "Postleitzahl", regionLabel: "Bundesland / State" },
  { code: "FR", name: "France", postalLabel: "Code Postal", regionLabel: "Region" },
  { code: "NL", name: "Netherlands", postalLabel: "Postcode", regionLabel: "Province" },
  { code: "CH", name: "Switzerland", postalLabel: "PLZ / Postal Code", regionLabel: "Canton" },
  { code: "SE", name: "Sweden", postalLabel: "Postnummer", regionLabel: "County" },
  { code: "SG", name: "Singapore", postalLabel: "Postal Code", regionLabel: "District / Region" },
  { code: "JP", name: "Japan", postalLabel: "Postal Code", regionLabel: "Prefecture" },
  { code: "IN", name: "India", postalLabel: "PIN Code", regionLabel: "State / UT" },
  { code: "BD", name: "Bangladesh", postalLabel: "Post Code", regionLabel: "Division / District" },
  { code: "AE", name: "United Arab Emirates", postalLabel: "P.O. Box / Postal Code", regionLabel: "Emirate" },
  { code: "BR", name: "Brazil", postalLabel: "CEP", regionLabel: "State" },
  { code: "ZA", name: "South Africa", postalLabel: "Postal Code", regionLabel: "Province" },
  { code: "NG", name: "Nigeria", postalLabel: "Postal Code", regionLabel: "State" },
  { code: "KE", name: "Kenya", postalLabel: "Postal Code", regionLabel: "County" },
  { code: "MY", name: "Malaysia", postalLabel: "Postcode", regionLabel: "State" },
  { code: "ID", name: "Indonesia", postalLabel: "Kode Pos", regionLabel: "Province" },
  { code: "IE", name: "Ireland", postalLabel: "Eircode", regionLabel: "County" },
  { code: "NZ", name: "New Zealand", postalLabel: "Postcode", regionLabel: "Region" },
] as const;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidWebsiteUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return true;
  try {
    const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(candidate);
    return (
      (parsed.protocol === "https:" || parsed.protocol === "http:") &&
      parsed.hostname.includes(".") &&
      !parsed.hostname.startsWith(".") &&
      !parsed.hostname.endsWith(".")
    );
  } catch {
    return false;
  }
}

export function normalizeOptionalWebsiteUrl(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(candidate);
  return parsed.toString().replace(/\/+$/, "");
}

/**
 * Supports international Unicode names (accents, apostrophes, hyphens, non-Latin scripts)
 * while rejecting control characters and HTML injection tags.
 */
export const humanNameSchema = z
  .string()
  .trim()
  .min(2, "Full name must be at least 2 characters")
  .max(120, "Full name must be at most 120 characters")
  .refine(
    (val) => !/[<>]/.test(val) && !/[\u0000-\u001F\u007F]/.test(val),
    "Name contains invalid control or markup characters"
  );

export const normalizedEmailSchema = z
  .string()
  .trim()
  .min(5, "Email address is required")
  .max(254, "Email address is too long")
  .email("Please enter a valid email address")
  .transform((val) => normalizeEmail(val));

export const optionalPhoneSchema = z
  .string()
  .trim()
  .max(32, "Phone number is too long")
  .refine(
    (val) => val === "" || /^\+?[1-9][0-9\s\-().]{5,24}$/.test(val),
    "Enter a valid phone number with international country code (e.g. +1 650 555 0100)"
  )
  .optional()
  .transform((val) => (val && val.trim() !== "" ? val.trim() : null));

export const optionalWebsiteSchema = z
  .string()
  .trim()
  .max(255, "Website URL is too long")
  .refine((val) => isValidWebsiteUrl(val), "Enter a valid website URL (e.g. https://university.edu)")
  .optional()
  .nullable()
  .transform((val) => normalizeOptionalWebsiteUrl(val));

export const countryCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, "Select a valid ISO 3166-1 alpha-2 country code");

export const adminStepSchema = z
  .object({
    fullName: humanNameSchema,
    email: normalizedEmailSchema,
    jobTitle: z
      .string()
      .trim()
      .min(2, "Position / job title is required")
      .max(100, "Job title must be at most 100 characters"),
    phoneNumber: optionalPhoneSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "Passwords do not match",
      });
    }
    if (isPasswordTooSimilarToEmail(data.password, data.email)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["password"],
        message: "Password must not contain your email username",
      });
    }
  });

export const institutionStepSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Institution display name must be at least 2 characters")
      .max(140, "Institution display name is too long"),
    legalEntityName: z
      .string()
      .trim()
      .min(2, "Registered legal entity name is required")
      .max(180, "Legal entity name is too long"),
    organizationType: z.enum(ORGANIZATION_TYPE_VALUES, {
      errorMap: () => ({ message: "Select a valid organization type" }),
    }),
    organizationTypeOther: z
      .string()
      .trim()
      .max(120, "Organization type description is too long")
      .optional()
      .nullable(),
    operatingCountryCode: countryCodeSchema,
    websiteUrl: optionalWebsiteSchema,
    registrationNumber: z
      .string()
      .trim()
      .max(100, "Registration number is too long")
      .optional()
      .nullable()
      .transform((v) => (v && v.trim() ? v.trim() : null)),
    registrationAuthority: z
      .string()
      .trim()
      .max(140, "Accreditation authority name is too long")
      .optional()
      .nullable()
      .transform((v) => (v && v.trim() ? v.trim() : null)),
    addressLine1: z.string().trim().min(2, "Address line 1 is required").max(160),
    addressLine2: z
      .string()
      .trim()
      .max(160)
      .optional()
      .nullable()
      .transform((v) => (v && v.trim() ? v.trim() : null)),
    city: z.string().trim().min(1, "City is required").max(100),
    region: z.string().trim().min(1, "State / Province / Region is required").max(100),
    postalCode: z.string().trim().min(1, "Postal / ZIP code is required").max(32),
    addressCountryCode: countryCodeSchema,
    contactPhone: optionalPhoneSchema,
    slug: z
      .string()
      .trim()
      .min(3)
      .max(64)
      .regex(/^[a-z0-9-]+$/, "Slug must contain only lowercase letters, numbers, and hyphens")
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.organizationType === "OTHER" &&
      (!data.organizationTypeOther || data.organizationTypeOther.trim().length < 2)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["organizationTypeOther"],
        message: "Please describe your organization type",
      });
    }
  });

export const reviewConsentSchema = z.object({
  authorizedToRegister: z.literal(true, {
    errorMap: () => ({ message: "You must confirm authorization to register this institution" }),
  }),
  termsAccepted: z.literal(true, {
    errorMap: () => ({ message: "You must accept the Terms of Service" }),
  }),
  privacyAccepted: z.literal(true, {
    errorMap: () => ({ message: "You must acknowledge the Privacy Policy" }),
  }),
  marketingOptIn: z.boolean().optional().default(false),
});

export const institutionRegistrationSchema = adminStepSchema
  .and(institutionStepSchema)
  .and(reviewConsentSchema);

export const walletRegistrationSchema = z
  .object({
    fullName: humanNameSchema,
    preferredDisplayName: z
      .string()
      .trim()
      .max(80, "Preferred display name is too long")
      .optional()
      .nullable()
      .transform((v) => (v && v.trim() ? v.trim() : null)),
    email: normalizedEmailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    termsAccepted: z.literal(true, {
      errorMap: () => ({ message: "You must accept the Terms of Service" }),
    }),
    privacyAccepted: z.literal(true, {
      errorMap: () => ({ message: "You must acknowledge the Privacy Policy" }),
    }),
    marketingOptIn: z.boolean().optional().default(false),
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "Passwords do not match",
      });
    }
    if (isPasswordTooSimilarToEmail(data.password, data.email)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["password"],
        message: "Password must not contain your email username",
      });
    }
  });

export type InstitutionRegistrationInput = z.infer<typeof institutionRegistrationSchema>;
export type WalletRegistrationInput = z.infer<typeof walletRegistrationSchema>;
