import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
        // Strategy variants
        trend: "border-transparent bg-strategy-trend/20 text-strategy-trend",
        mean: "border-transparent bg-strategy-mean/20 text-strategy-mean",
        breakout: "border-transparent bg-strategy-breakout/20 text-strategy-breakout",
        // Status variants
        elite: "border-transparent bg-status-elite/20 text-status-elite",
        active: "border-transparent bg-status-active/20 text-status-active",
        probation: "border-transparent bg-status-probation/20 text-status-probation",
        removed: "border-transparent bg-status-removed/20 text-status-removed",
        // Special variants
        glow: "border-primary/30 bg-primary/10 text-primary shadow-glow",
        success: "border-transparent bg-success/20 text-success",
        warning: "border-transparent bg-warning/20 text-warning",
        danger: "border-transparent bg-danger/20 text-danger",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
