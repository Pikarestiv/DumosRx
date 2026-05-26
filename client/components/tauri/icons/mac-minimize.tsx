import React from "react";

interface MacIconProps {
  className?: string;
}

export function MacMinimizeIcon({ className }: MacIconProps) {
  return (
    <svg
      viewBox="0 0 14 14"
      className={className}
    >
      <path
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        d="M3 7h8"
      />
    </svg>
  );
}
