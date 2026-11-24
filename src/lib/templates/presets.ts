import type {
  TemplateCategory,
  PageDimensions,
  TemplateLayoutConfig,
  TemplateField,
  SignatureConfig,
  QrCodeConfig,
  BorderConfig,
} from "../../types/template.ts";

export const DEFAULT_PAGE_DIMENSIONS: PageDimensions = {
  width: 1120,
  height: 792,
  orientation: "LANDSCAPE",
  unit: "PX",
};

export const STANDARD_PLACEHOLDERS = [
  // Master Roadmap Phase 5 Dot-Notation Placeholders
  { key: "{{recipient.name}}", label: "Recipient Full Name", sample: "Dr. Eleanor Vance" },
  { key: "{{recipient.email}}", label: "Recipient Email Address", sample: "eleanor.vance@stanford.edu" },
  { key: "{{credential.title}}", label: "Credential / Course / Award Title", sample: "Advanced Cryptographic Engineering" },
  { key: "{{credential.description}}", label: "Credential Description", sample: "Demonstrated mastery of distributed consensus and zero-knowledge proofs." },
  { key: "{{credential.certificateNumber}}", label: "Certificate Unique Number", sample: "CREDVAIL-2026-000001" },
  { key: "{{issuer.name}}", label: "Issuing Organization Name", sample: "Apex Institute of Technology" },
  { key: "{{credential.issueDate}}", label: "Issuance Date", sample: "November 15, 2026" },
  { key: "{{credential.expiryDate}}", label: "Expiration Date", sample: "November 15, 2028" },
  { key: "{{completion.date}}", label: "Completion Date", sample: "October 30, 2026" },
  { key: "{{instructor.name}}", label: "Lead Instructor / Dean", sample: "Prof. Alan Turing, FRS" },
  { key: "{{credential.verificationUrl}}", label: "Cryptographic Verification Link", sample: "https://credvail.io/verify/CREDVAIL-2026-000001" },

  // Standard Snake-Case Placeholders (Backwards Compatibility)
  { key: "{{recipient_name}}", label: "Recipient Full Name", sample: "Dr. Eleanor Vance" },
  { key: "{{certificate_number}}", label: "Certificate Number", sample: "CREDVAIL-2026-000001" },
  { key: "{{course_name}}", label: "Course / Event / Award Title", sample: "Advanced Cryptographic Engineering" },
  { key: "{{organization_name}}", label: "Organization Name", sample: "Apex Institute of Technology" },
  { key: "{{issue_date}}", label: "Issuance Date", sample: "November 15, 2026" },
  { key: "{{completion_date}}", label: "Completion Date", sample: "October 30, 2026" },
  { key: "{{grade}}", label: "Grade / Honors", sample: "First Class with Distinction" },
  { key: "{{instructor_name}}", label: "Lead Instructor / Director", sample: "Prof. Alan Turing, FRS" },
  { key: "{{verification_url}}", label: "Cryptographic Verification Link", sample: "https://credvail.io/verify/CREDVAIL-2026-000001" },
];

export const SUPPORTED_FONT_FAMILIES = [
  { name: "Inter", cssFamily: "Inter, sans-serif", category: "sans-serif" },
  { name: "Georgia", cssFamily: "Georgia, serif", category: "serif" },
  { name: "Playfair Display", cssFamily: "'Playfair Display', Georgia, serif", category: "serif" },
  { name: "Cinzel", cssFamily: "Cinzel, serif", category: "display" },
  { name: "Montserrat", cssFamily: "Montserrat, sans-serif", category: "sans-serif" },
  { name: "Courier New", cssFamily: "'Courier New', monospace", category: "monospace" },
];

export const SUPPORTED_BORDER_STYLES = [
  { id: "classic", name: "Classic Double Border", description: "Traditional institutional double border with gold inset" },
  { id: "modern", name: "Modern Minimal Line", description: "Clean single-line geometric border" },
  { id: "ornate", name: "Ornate Academic Flourish", description: "Corner rosettes and detailed diploma accenting" },
  { id: "minimal", name: "Subtle Micro Frame", description: "Delicate hairline frame for contemporary designs" },
  { id: "none", name: "Border Free", description: "Unbounded edge-to-edge canvas" },
];

export interface TemplatePresetDefinition {
  category: TemplateCategory;
  title: string;
  description: string;
  layoutConfig: TemplateLayoutConfig;
}

function createBaseFields(
  headerTitle: string,
  subtitleText: string,
  awardReason: string,
  primaryColor: string = "#0f172a",
  goldColor: string = "#d97706"
): TemplateField[] {
  return [
    {
      id: "f_org_name",
      name: "Organization Name",
      placeholder: "{{organization_name}}",
      defaultValue: "INSTITUTION OF CREDENTIAL ARCHITECTURE",
      x: 50,
      y: 14,
      fontSize: 16,
      fontFamily: "Inter, sans-serif",
      fontWeight: "bold",
      color: primaryColor,
      align: "center",
      isMandatory: true,
    },
    {
      id: "f_title",
      name: "Certificate Header",
      placeholder: headerTitle,
      defaultValue: headerTitle,
      x: 50,
      y: 22,
      fontSize: 34,
      fontFamily: "Georgia, serif",
      fontWeight: "bold",
      color: goldColor,
      align: "center",
      isMandatory: true,
    },
    {
      id: "f_subtitle",
      name: "Presentation Lead",
      placeholder: subtitleText,
      defaultValue: subtitleText,
      x: 50,
      y: 32,
      fontSize: 13,
      fontFamily: "Inter, sans-serif",
      fontWeight: "normal",
      fontStyle: "italic",
      color: "#64748b",
      align: "center",
    },
    {
      id: "f_recipient",
      name: "Recipient Name",
      placeholder: "{{recipient_name}}",
      defaultValue: "RECIPIENT FULL NAME",
      x: 50,
      y: 42,
      fontSize: 36,
      fontFamily: "Georgia, serif",
      fontWeight: "bold",
      color: primaryColor,
      align: "center",
      isMandatory: true,
    },
    {
      id: "f_reason",
      name: "Award Reason Text",
      placeholder: awardReason,
      defaultValue: awardReason,
      x: 50,
      y: 52,
      fontSize: 13,
      fontFamily: "Inter, sans-serif",
      fontWeight: "normal",
      color: "#475569",
      align: "center",
    },
    {
      id: "f_course",
      name: "Program / Course Title",
      placeholder: "{{course_name}}",
      defaultValue: "ADVANCED SPECIALIZATION PROGRAM",
      x: 50,
      y: 60,
      fontSize: 22,
      fontFamily: "Georgia, serif",
      fontWeight: "bold",
      color: primaryColor,
      align: "center",
      isMandatory: true,
    },
    {
      id: "f_dates",
      name: "Date Details",
      placeholder: "Completed on {{completion_date}} • Issued on {{issue_date}}",
      defaultValue: "Completed on October 30, 2026 • Issued on November 15, 2026",
      x: 50,
      y: 69,
      fontSize: 11,
      fontFamily: "Inter, sans-serif",
      fontWeight: "normal",
      color: "#64748b",
      align: "center",
    },
    {
      id: "f_cert_num",
      name: "Certificate Number",
      placeholder: "Certificate ID: {{certificate_number}}",
      defaultValue: "Certificate ID: CREDVAIL-2026-000001",
      x: 18,
      y: 90,
      fontSize: 10,
      fontFamily: "monospace",
      fontWeight: "bold",
      color: "#475569",
      align: "left",
      isMandatory: true,
    },
    {
      id: "f_verify_link",
      name: "Verification Link",
      placeholder: "Verify: {{verification_url}}",
      defaultValue: "Verify: https://credvail.io/verify/CREDVAIL-2026-000001",
      x: 18,
      y: 93,
      fontSize: 9,
      fontFamily: "monospace",
      fontWeight: "normal",
      color: "#64748b",
      align: "left",
      isMandatory: true,
    },
  ];
}

const DEFAULT_SIGNATURES: SignatureConfig[] = [
  {
    id: "sig_instructor",
    title: "Lead Academic Instructor",
    signatoryName: "Prof. Alan Turing, FRS",
    x: 45,
    y: 84,
    width: 160,
    height: 50,
  },
  {
    id: "sig_director",
    title: "Dean of Credentials",
    signatoryName: "Dr. Eleanor Vance",
    x: 70,
    y: 84,
    width: 160,
    height: 50,
  },
];

const DEFAULT_QR_CONFIG: QrCodeConfig = {
  x: 90,
  y: 87,
  size: 88,
  errorCorrectionLevel: "M",
  includeMargin: true,
  color: {
    dark: "#0f172a",
    light: "#ffffff",
  },
};

const DEFAULT_BORDER_CONFIG: BorderConfig = {
  style: "classic",
  color: "#0f172a",
  secondaryColor: "#d97706",
  width: 4,
};

export const TEMPLATE_PRESETS: Record<TemplateCategory, TemplatePresetDefinition> = {
  COURSE_COMPLETION: {
    category: "COURSE_COMPLETION",
    title: "Course Completion Certificate",
    description: "Standard academic certificate for completion of courses, modules, or formal syllabi.",
    layoutConfig: {
      backgroundColor: "#ffffff",
      secondaryBackgroundColor: "#f8fafc",
      border: DEFAULT_BORDER_CONFIG,
      logo: { x: 50, y: 7, width: 64, height: 64 },
      fields: createBaseFields(
        "CERTIFICATE OF COMPLETION",
        "This is to certify that",
        "has successfully met all academic requirements and completed the course"
      ),
      signatures: DEFAULT_SIGNATURES,
      qrCode: DEFAULT_QR_CONFIG,
    },
  },

  EVENT_PARTICIPATION: {
    category: "EVENT_PARTICIPATION",
    title: "Event Participation Certificate",
    description: "Recognizes attendee or delegate contribution and active presence in an institutional event.",
    layoutConfig: {
      backgroundColor: "#ffffff",
      secondaryBackgroundColor: "#fdf8f6",
      border: { ...DEFAULT_BORDER_CONFIG, color: "#9a3412", secondaryColor: "#ea580c" },
      logo: { x: 50, y: 7, width: 64, height: 64 },
      fields: createBaseFields(
        "CERTIFICATE OF PARTICIPATION",
        "Proudly presented to",
        "in recognition of active attendance and dedicated participation at",
        "#9a3412",
        "#ea580c"
      ),
      signatures: DEFAULT_SIGNATURES,
      qrCode: DEFAULT_QR_CONFIG,
    },
  },

  INTERNSHIP_COMPLETION: {
    category: "INTERNSHIP_COMPLETION",
    title: "Internship Completion Certificate",
    description: "Official credential certifying successful completion of an industrial or research internship.",
    layoutConfig: {
      backgroundColor: "#ffffff",
      secondaryBackgroundColor: "#f0fdf4",
      border: { ...DEFAULT_BORDER_CONFIG, color: "#14532d", secondaryColor: "#16a34a" },
      logo: { x: 50, y: 7, width: 64, height: 64 },
      fields: createBaseFields(
        "CERTIFICATE OF INTERNSHIP",
        "This credential is awarded to",
        "for commendable performance and practical mastery demonstrated during the internship in",
        "#14532d",
        "#16a34a"
      ),
      signatures: DEFAULT_SIGNATURES,
      qrCode: DEFAULT_QR_CONFIG,
    },
  },

  TRAINING_COMPLETION: {
    category: "TRAINING_COMPLETION",
    title: "Professional Training Certificate",
    description: "Certifies rigorous completion of specialized technical or executive training bootcamps.",
    layoutConfig: {
      backgroundColor: "#ffffff",
      secondaryBackgroundColor: "#f8fafc",
      border: { ...DEFAULT_BORDER_CONFIG, color: "#1e3a8a", secondaryColor: "#3b82f6" },
      logo: { x: 50, y: 7, width: 64, height: 64 },
      fields: createBaseFields(
        "CERTIFICATE OF TRAINING",
        "Conferred upon",
        "having demonstrated professional competence throughout the intensive training on",
        "#1e3a8a",
        "#3b82f6"
      ),
      signatures: DEFAULT_SIGNATURES,
      qrCode: DEFAULT_QR_CONFIG,
    },
  },

  ACHIEVEMENT: {
    category: "ACHIEVEMENT",
    title: "Certificate of Outstanding Achievement",
    description: "Honors superior merit, distinction, exceptional performance, and scholarly milestones.",
    layoutConfig: {
      backgroundColor: "#ffffff",
      secondaryBackgroundColor: "#fefce8",
      border: { ...DEFAULT_BORDER_CONFIG, color: "#854d0e", secondaryColor: "#eab308" },
      logo: { x: 50, y: 7, width: 64, height: 64 },
      fields: createBaseFields(
        "CERTIFICATE OF ACHIEVEMENT",
        "Awarded with highest honors to",
        "in recognition of exemplary dedication, leadership, and outstanding triumph in",
        "#854d0e",
        "#eab308"
      ),
      signatures: DEFAULT_SIGNATURES,
      qrCode: DEFAULT_QR_CONFIG,
    },
  },

  APPRECIATION: {
    category: "APPRECIATION",
    title: "Certificate of Appreciation",
    description: "Expresses gratitude for voluntary service, mentorship, patronage, or keynote delivery.",
    layoutConfig: {
      backgroundColor: "#ffffff",
      secondaryBackgroundColor: "#faf5ff",
      border: { ...DEFAULT_BORDER_CONFIG, color: "#581c87", secondaryColor: "#a855f7" },
      logo: { x: 50, y: 7, width: 64, height: 64 },
      fields: createBaseFields(
        "CERTIFICATE OF APPRECIATION",
        "Presented with sincere gratitude to",
        "for invaluable contributions, guidance, and generous commitment towards",
        "#581c87",
        "#a855f7"
      ),
      signatures: DEFAULT_SIGNATURES,
      qrCode: DEFAULT_QR_CONFIG,
    },
  },

  MEMBERSHIP: {
    category: "MEMBERSHIP",
    title: "Certificate of Institutional Membership",
    description: "Validates active member standing in professional bodies, societies, or alumni networks.",
    layoutConfig: {
      backgroundColor: "#ffffff",
      secondaryBackgroundColor: "#f0fdfa",
      border: { ...DEFAULT_BORDER_CONFIG, color: "#134e4a", secondaryColor: "#14b8a6" },
      logo: { x: 50, y: 7, width: 64, height: 64 },
      fields: createBaseFields(
        "CERTIFICATE OF MEMBERSHIP",
        "This certifies that",
        "is an accredited and verified member in good standing of the",
        "#134e4a",
        "#14b8a6"
      ),
      signatures: DEFAULT_SIGNATURES,
      qrCode: DEFAULT_QR_CONFIG,
    },
  },

  WORKSHOP_ATTENDANCE: {
    category: "WORKSHOP_ATTENDANCE",
    title: "Workshop Attendance Certificate",
    description: "Confirms hands-on workshop attendance and experiential lab completion.",
    layoutConfig: {
      backgroundColor: "#ffffff",
      secondaryBackgroundColor: "#eff6ff",
      border: { ...DEFAULT_BORDER_CONFIG, color: "#172554", secondaryColor: "#2563eb" },
      logo: { x: 50, y: 7, width: 64, height: 64 },
      fields: createBaseFields(
        "WORKSHOP CERTIFICATE",
        "Awarded to",
        "for successful participation and completion of technical practicals in the workshop",
        "#172554",
        "#2563eb"
      ),
      signatures: DEFAULT_SIGNATURES,
      qrCode: DEFAULT_QR_CONFIG,
    },
  },

  COMPETITION_PARTICIPATION: {
    category: "COMPETITION_PARTICIPATION",
    title: "Competition Participation & Excellence",
    description: "Recognizes competitive placement, hackathon awards, or olympiad contest ranking.",
    layoutConfig: {
      backgroundColor: "#ffffff",
      secondaryBackgroundColor: "#fff1f2",
      border: { ...DEFAULT_BORDER_CONFIG, color: "#881337", secondaryColor: "#e11d48" },
      logo: { x: 50, y: 7, width: 64, height: 64 },
      fields: createBaseFields(
        "AWARD OF COMPETITION EXCELLENCE",
        "Presented to",
        "for demonstrating exceptional skill, resilience, and honorable placement in the",
        "#881337",
        "#e11d48"
      ),
      signatures: DEFAULT_SIGNATURES,
      qrCode: DEFAULT_QR_CONFIG,
    },
  },

  CUSTOM: {
    category: "CUSTOM",
    title: "Custom Institutional Credential",
    description: "Blank canvas template with customizable field coordinates, borders, and signatures.",
    layoutConfig: {
      backgroundColor: "#ffffff",
      secondaryBackgroundColor: "#f8fafc",
      border: DEFAULT_BORDER_CONFIG,
      logo: { x: 50, y: 7, width: 64, height: 64 },
      fields: createBaseFields(
        "OFFICIAL CREDENTIAL",
        "This is to certify that",
        "has achieved recognition for fulfilling the criteria of"
      ),
      signatures: DEFAULT_SIGNATURES,
      qrCode: DEFAULT_QR_CONFIG,
    },
  },
};
