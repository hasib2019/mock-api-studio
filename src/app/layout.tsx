import type { Metadata, Viewport } from "next";
import { Toaster } from "@/components/toast";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mock API Studio",
  description:
    "Self-hosted sandbox for banking APIs — register endpoints, validation rules and response scenarios, then call them like the real thing.",
};

export const viewport: Viewport = {
  themeColor: "#4f46e5",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-slate-50 font-sans text-sm text-slate-900 antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
