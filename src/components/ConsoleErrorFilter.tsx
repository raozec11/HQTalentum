"use client";

import { useEffect } from "react";

export default function ConsoleErrorFilter() {
  useEffect(() => {
    if (typeof window === "undefined" || process.env.NODE_ENV !== "development") return;

    const originalError = console.error;
    console.error = (...args) => {
      // Convert arguments to a search string
      const errorStr = args
        .map(arg => {
          if (arg instanceof Error) return arg.message + "\n" + arg.stack;
          if (typeof arg === "object") {
            try {
              return JSON.stringify(arg);
            } catch {
              return String(arg);
            }
          }
          return String(arg);
        })
        .join(" ");

      // If the error message is related to Firebase Auth invalid-credential, user-not-found, wrong-password, etc.
      // print it as console.warn to avoid triggering the Next.js 15 Dev Error Overlay.
      if (
        errorStr.includes("auth/invalid-credential") ||
        errorStr.includes("auth/user-not-found") ||
        errorStr.includes("auth/wrong-password") ||
        errorStr.includes("auth/invalid-email")
      ) {
        console.warn("[Filtered Auth Exception]:", ...args);
        return;
      }

      originalError.apply(console, args);
    };

    return () => {
      console.error = originalError;
    };
  }, []);

  return null;
}
