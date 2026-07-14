"use client";

import { motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { useRef, useEffect } from "react";

const tabs = ["/dashboard", "/pos", "/inventory", "/customers"];

export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const currentIndex = tabs.findIndex(t => pathname.startsWith(t));
  const prevIndexRef = useRef(currentIndex);
  
  useEffect(() => {
    prevIndexRef.current = currentIndex;
  }, [currentIndex]);

  const direction = currentIndex > prevIndexRef.current ? 1 : -1;

  const slideVariants = {
    enter: (d: number) => ({ x: d > 0 ? 30 : -30, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: d > 0 ? -30 : 30, opacity: 0 }),
  };

  return (
    <motion.div
      custom={direction}
      variants={slideVariants}
      initial="enter"
      animate="center"
      transition={{ duration: 0.2, ease: "easeInOut" }}
      className="w-full h-full"
    >
      {children}
    </motion.div>
  );
}
