import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-gradient-to-br from-primary-600 to-primary-700 text-white shadow-sm hover:from-primary-500 hover:to-primary-600 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0",
        destructive: "bg-gradient-to-br from-red-600 to-red-700 text-white shadow-sm hover:from-red-500 hover:to-red-600 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0",
        outline: "border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-foreground",
        secondary: "border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-foreground",
        ghost: "bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        accent: "bg-gradient-to-br from-accent-500 to-accent-600 text-white shadow-sm hover:from-accent-400 hover:to-accent-500 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-lg px-3",
        lg: "h-11 rounded-lg px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
