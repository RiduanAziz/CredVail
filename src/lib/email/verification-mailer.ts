export interface OutboundVerificationEmail {
  to: string;
  fullName: string;
  accountType: "institution" | "wallet";
  institutionName?: string;
  verificationUrl: string;
  sentAt: string;
  provider: string;
}

export interface EmailDeliveryOutcome {
  delivered: boolean;
  provider: string;
  devPreviewUrl?: string;
  errorMessage?: string;
}

const globalForMail = globalThis as unknown as {
  __credvailVerificationMailOutbox?: OutboundVerificationEmail[];
  __credvailSimulateMailFailure?: boolean;
};

const mailOutbox =
  globalForMail.__credvailVerificationMailOutbox ||
  (globalForMail.__credvailVerificationMailOutbox = []);

export class VerificationMailer {
  static resetForTesting(): void {
    mailOutbox.length = 0;
    globalForMail.__credvailSimulateMailFailure = false;
  }

  static setSimulateFailureForTesting(shouldFail: boolean): void {
    globalForMail.__credvailSimulateMailFailure = shouldFail;
  }

  static getOutboxForTesting(): OutboundVerificationEmail[] {
    return [...mailOutbox];
  }

  static getLatestPreviewForEmail(email: string): OutboundVerificationEmail | undefined {
    const normalized = email.trim().toLowerCase();
    for (let i = mailOutbox.length - 1; i >= 0; i--) {
      if (mailOutbox[i].to === normalized) {
        return mailOutbox[i];
      }
    }
    return undefined;
  }

  static buildVerificationUrl(rawToken: string, baseUrl?: string): string {
    const origin = (
      baseUrl ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "http://localhost:3000"
    ).replace(/\/+$/, "");
    return `${origin}/verify-email?token=${encodeURIComponent(rawToken)}`;
  }

  /**
   * Sends an account email-verification message using the configured provider.
   * Never leaks raw verification tokens into production responses or logs.
   */
  static async sendVerificationEmail(params: {
    to: string;
    fullName: string;
    rawToken: string;
    accountType: "institution" | "wallet";
    institutionName?: string;
    baseUrl?: string;
  }): Promise<EmailDeliveryOutcome> {
    const normalizedEmail = params.to.trim().toLowerCase();
    const verificationUrl = this.buildVerificationUrl(params.rawToken, params.baseUrl);
    const isProd = process.env.NODE_ENV === "production";
    const configuredProvider = (process.env.EMAIL_PROVIDER || (isProd ? "resend" : "dev-preview")).toLowerCase();

    if (globalForMail.__credvailSimulateMailFailure) {
      return {
        delivered: false,
        provider: configuredProvider,
        errorMessage: "Simulated email transport failure",
      };
    }

    const from = process.env.EMAIL_FROM || "CREDVAIL Identity <no-reply@credvail.io>";
    const subject =
      params.accountType === "institution"
        ? `Verify your CREDVAIL institutional email (${params.institutionName || "Organization"})`
        : "Verify your CREDVAIL personal wallet account";

    const textBody = [
      `Hello ${params.fullName},`,
      "",
      params.accountType === "institution"
        ? `Please verify your official work email to activate your account and access ${params.institutionName || "your institution"} on CREDVAIL.`
        : "Please verify your email address to activate your CREDVAIL personal credential wallet.",
      "",
      `Verification link: ${verificationUrl}`,
      "",
      "This single-use link expires in 24 hours.",
    ].join("\n");

    if (configuredProvider === "resend" && process.env.RESEND_API_KEY) {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from,
            to: [normalizedEmail],
            subject,
            text: textBody,
          }),
        });
        if (!res.ok) {
          return {
            delivered: false,
            provider: "resend",
            errorMessage: `Email provider returned HTTP ${res.status}`,
          };
        }
        return { delivered: true, provider: "resend" };
      } catch (err: any) {
        return {
          delivered: false,
          provider: "resend",
          errorMessage: err?.message || "Email network delivery failure",
        };
      }
    }

    if (configuredProvider === "webhook" && process.env.EMAIL_WEBHOOK_URL) {
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (process.env.EMAIL_WEBHOOK_BEARER_TOKEN) {
          headers.Authorization = `Bearer ${process.env.EMAIL_WEBHOOK_BEARER_TOKEN}`;
        }
        const res = await fetch(process.env.EMAIL_WEBHOOK_URL, {
          method: "POST",
          headers,
          body: JSON.stringify({
            from,
            to: normalizedEmail,
            subject,
            text: textBody,
            verificationUrl,
          }),
        });
        if (!res.ok) {
          return {
            delivered: false,
            provider: "webhook",
            errorMessage: `Email webhook returned HTTP ${res.status}`,
          };
        }
        return { delivered: true, provider: "webhook" };
      } catch (err: any) {
        return {
          delivered: false,
          provider: "webhook",
          errorMessage: err?.message || "Email webhook delivery error",
        };
      }
    }

    if (isProd) {
      return {
        delivered: false,
        provider: configuredProvider,
        errorMessage: "Production outbound email provider is not configured.",
      };
    }

    // Non-production mock / local dev preview store
    const record: OutboundVerificationEmail = {
      to: normalizedEmail,
      fullName: params.fullName,
      accountType: params.accountType,
      institutionName: params.institutionName,
      verificationUrl,
      sentAt: new Date().toISOString(),
      provider: process.env.NODE_ENV === "test" ? "mock" : "dev-preview",
    };
    mailOutbox.push(record);
    if (mailOutbox.length > 50) {
      mailOutbox.shift();
    }

    return {
      delivered: true,
      provider: record.provider,
      ...(process.env.NODE_ENV === "development" ? { devPreviewUrl: verificationUrl } : {}),
    };
  }
}
