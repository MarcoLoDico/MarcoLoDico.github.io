import type { ButtonHTMLAttributes, ReactNode } from "react";

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "children" | "type"> {
  readonly label: string;
  readonly children: ReactNode;
}

export function IconButton({ label, children, className, ...buttonProps }: IconButtonProps) {
  return (
    <button
      {...buttonProps}
      type="button"
      className={className ? `icon-button ${className}` : "icon-button"}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}
