import type { ReactNode } from "react";

import "./globals.css";

export const metadata = {
  title: "Remi Change Order Submission",
  description: "Contractor change order submission app.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
