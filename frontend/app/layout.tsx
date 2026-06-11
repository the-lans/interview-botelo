import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Interview Coach",
  description: "Interview Coach frontend",
};

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({
  children,
}: RootLayoutProps): JSX.Element {
  return (
    <html lang="ru">
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
