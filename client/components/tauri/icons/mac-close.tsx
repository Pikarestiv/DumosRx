import React from "react";

interface MacIconProps {
  className?: string;
}

export function MacCloseIcon({ className }: MacIconProps) {
  return (
    <svg
      viewBox="0 0 14 14"
      className={className}
    >
      <path
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        d="M4 4l6 6M10 4L4 10"
      />
    </svg>
  );
}
