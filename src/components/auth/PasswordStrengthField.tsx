"use client";

import * as React from "react";
import { Eye, EyeOff, Lock, CheckCircle2, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  evaluatePasswordStrength,
} from "@/lib/auth/password-policy";

interface PasswordStrengthFieldProps {
  password: string;
  confirmPassword: string;
  onPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  passwordError?: string;
  confirmError?: string;
  passwordLabel?: string;
  confirmLabel?: string;
  disabled?: boolean;
}

export function PasswordStrengthField({
  password,
  confirmPassword,
  onPasswordChange,
  onConfirmPasswordChange,
  passwordError,
  confirmError,
  passwordLabel = "Password",
  confirmLabel = "Confirm Password",
  disabled = false,
}: PasswordStrengthFieldProps) {
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirm, setShowConfirm] = React.useState(false);

  const strength = React.useMemo(() => evaluatePasswordStrength(password), [password]);
  const passwordsMatch =
    confirmPassword.length > 0 && password.length > 0 && password === confirmPassword;
  const passwordsMismatch =
    confirmPassword.length > 0 && password !== confirmPassword;

  const barColor =
    strength.score <= 1
      ? "bg-red-500"
      : strength.score === 2
      ? "bg-amber-500"
      : strength.score === 3
      ? "bg-emerald-500"
      : "bg-[#0F1D38]";

  const barWidth =
    strength.length === 0
      ? "0%"
      : strength.score === 1
      ? "25%"
      : strength.score === 2
      ? "55%"
      : strength.score === 3
      ? "80%"
      : "100%";

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-[#0F172A]" htmlFor="password">
            {passwordLabel} <span className="text-red-600">*</span>
          </label>
          <span className="font-mono text-[11px] text-[#64748B]">
            {strength.length}/{PASSWORD_MIN_LENGTH}+ chars
          </span>
        </div>

        <div className="relative">
          <Lock className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" />
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            placeholder="Use a memorable 15+ character passphrase"
            className="pl-9 pr-10"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            maxLength={PASSWORD_MAX_LENGTH}
            disabled={disabled}
            aria-invalid={Boolean(passwordError || strength.isBlocked)}
            aria-describedby="password-guidance"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            className="absolute right-2.5 top-2 rounded p-1 text-[#64748B] hover:text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0F1D38]"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        {/* Strength meter */}
        <div className="space-y-1.5 pt-1" id="password-guidance">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className={`h-full transition-all duration-200 ${barColor}`}
              style={{ width: barWidth }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span
              className={
                strength.meetsLength && !strength.isBlocked
                  ? "flex items-center gap-1 text-emerald-700 font-medium"
                  : "text-[#64748B]"
              }
            >
              {strength.meetsLength && !strength.isBlocked ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  <span>Meets 15+ character passphrase standard (spaces & Unicode supported)</span>
                </>
              ) : strength.isBlocked ? (
                <span className="flex items-center gap-1 text-red-600 font-medium">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  Common or repetitive password — choose a stronger passphrase
                </span>
              ) : (
                `Minimum ${PASSWORD_MIN_LENGTH} characters (spaces and Unicode permitted; no forced symbols)`
              )}
            </span>
            {strength.length > 0 && (
              <span className="font-mono font-medium text-[#475569]">{strength.label}</span>
            )}
          </div>
        </div>

        {passwordError && (
          <p role="alert" className="text-xs text-red-600 flex items-center gap-1.5 mt-1">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{passwordError}</span>
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-[#0F172A]" htmlFor="confirmPassword">
          {confirmLabel} <span className="text-red-600">*</span>
        </label>
        <div className="relative">
          <Lock className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" />
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type={showConfirm ? "text" : "password"}
            autoComplete="new-password"
            placeholder="Re-enter your passphrase"
            className="pl-9 pr-10"
            value={confirmPassword}
            onChange={(e) => onConfirmPasswordChange(e.target.value)}
            maxLength={PASSWORD_MAX_LENGTH}
            disabled={disabled}
            aria-invalid={Boolean(confirmError || passwordsMismatch)}
            required
          />
          <button
            type="button"
            onClick={() => setShowConfirm((prev) => !prev)}
            className="absolute right-2.5 top-2 rounded p-1 text-[#64748B] hover:text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0F1D38]"
            aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}
          >
            {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        {passwordsMatch && !confirmError && (
          <p className="text-[11px] text-emerald-700 flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Passwords match</span>
          </p>
        )}
        {(confirmError || passwordsMismatch) && (
          <p role="alert" className="text-xs text-red-600 flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{confirmError || "Passwords do not match"}</span>
          </p>
        )}
      </div>
    </div>
  );
}
