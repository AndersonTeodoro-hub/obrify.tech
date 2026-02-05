import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive text-destructive-foreground",
        outline: "text-foreground border-slate-200 dark:border-slate-700",
        critical: "border-transparent bg-gradient-to-r from-red-600 to-red-700 text-white",
        high: "border-transparent bg-gradient-to-r from-amber-500 to-amber-600 text-slate-900",
        medium: "border-transparent bg-gradient-to-r from-blue-500 to-blue-600 text-white",
        low: "border-transparent bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300",
        success: "border-transparent bg-gradient-to-r from-green-500 to-green-600 text-white",
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
