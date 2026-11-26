import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none",
  {
    variants: {
      variant: {
        default:
          "rounded-lg bg-[#0F1D38] text-white shadow-none hover:bg-[#152445] active:scale-[0.98]",
        destructive:
          "rounded-lg bg-destructive text-destructive-foreground shadow-none hover:bg-destructive/90 active:scale-[0.98]",
        outline:
          "rounded-lg border border-black/[0.12] bg-white text-[#0F1D38] shadow-none hover:bg-slate-50",
        secondary:
          "rounded-lg bg-slate-100 text-[#0F172A] shadow-none hover:bg-slate-200/70",
        ghost: "rounded-lg hover:bg-slate-100 text-[#475569] hover:text-[#0F172A]",
        link: "text-[#0F1D38] underline-offset-4 hover:underline",
        brand:
          "rounded-lg bg-[#0F1D38] text-white shadow-none hover:bg-[#152445] active:scale-[0.98] border-0 transition-colors",
        brandOutline:
          "rounded-lg border border-black/[0.12] bg-white text-[#0F1D38] hover:bg-slate-50 shadow-none transition-colors",
        verified:
          "rounded-lg bg-emerald-600 text-white shadow-none hover:bg-emerald-700 active:scale-[0.98]",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-11 rounded-md px-8 text-base",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
