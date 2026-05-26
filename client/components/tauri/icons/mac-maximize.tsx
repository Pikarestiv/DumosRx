import React from "react";

interface MacIconProps {
  className?: string;
}

export function MacMaximizeIcon({ className }: MacIconProps) {
  return (
    <svg
      viewBox="0 0 14 14"
      className={className}
    >
      <path
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7 4H4v3M7 10h3V7"
      />
    </svg>
  );
}
