// CREDVAIL Certificate Template System Types

export type TemplateCategory =
  | "COURSE_COMPLETION"
  | "EVENT_PARTICIPATION"
  | "INTERNSHIP_COMPLETION"
  | "TRAINING_COMPLETION"
  | "ACHIEVEMENT"
  | "APPRECIATION"
  | "MEMBERSHIP"
  | "WORKSHOP_ATTENDANCE"
  | "COMPETITION_PARTICIPATION"
  | "CUSTOM";

export type PageOrientation = "LANDSCAPE" | "PORTRAIT";

export interface PageDimensions {
  width: number; // In px (standard landscape A4 ratio: 1120 x 792)
  height: number;
  orientation: PageOrientation;
  unit: "PX" | "MM";
}

export interface TemplateField {
  id: string;
  name: string;
  placeholder: string; // e.g. "{{recipient_name}}"
  defaultValue: string;
  x: number; // percentage (0-100) or px
  y: number; // percentage (0-100) or px
  width?: number;
  height?: number;
  fontSize: number; // in pt / px
  fontFamily: string; // "Inter", "Playfair Display", "Cinzel", "Cinzel Decorative", "Montserrat", "serif", "sans-serif"
  fontWeight: "normal" | "medium" | "semibold" | "bold";
  fontStyle?: "normal" | "italic";
  color: string; // Hex color
  align: "left" | "center" | "right";
  isMandatory?: boolean;
}

export interface SignatureConfig {
  id: string;
  title: string; // e.g. "Authorized Signatory", "Dean of Academic Affairs"
  signatoryName: string; // e.g. "Dr. Alan Turing"
  signatureImageUrl?: string; // Optional signature PNG data URL
  x: number; // percentage
  y: number; // percentage
  width: number;
  height: number;
}

export interface QrCodeConfig {
  x: number; // percentage
  y: number; // percentage
  size: number; // e.g. 96px
  errorCorrectionLevel: "L" | "M" | "Q" | "H";
  includeMargin: boolean;
  color?: {
    dark: string;
    light: string;
  };
}

export interface BorderConfig {
  style: "classic" | "modern" | "ornate" | "minimal" | "none";
  color: string; // Primary border color
  secondaryColor?: string; // Accent / Gold border color
  width: number; // in px
}

export interface LogoConfig {
  url?: string;
  x: number; // percentage
  y: number; // percentage
  width: number;
  height: number;
}

export interface TemplateLayoutConfig {
  backgroundColor: string;
  secondaryBackgroundColor?: string;
  border: BorderConfig;
  logo: LogoConfig;
  fields: TemplateField[];
  signatures: SignatureConfig[];
  qrCode: QrCodeConfig;
  customVariables?: string[];
}

export interface CertificateTemplateRecord {
  id: string;
  tenantId: string;
  title: string;
  name?: string;
  description: string | null;
  category: TemplateCategory;
  dimensions: PageDimensions;
  layoutConfig: TemplateLayoutConfig;
  backgroundImageUrl: string | null;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}
