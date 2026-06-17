import type { Metadata } from "next";
import "./globals.css";
import { LogoutButton } from "../components/LogoutButton";

export const metadata: Metadata = {
  title: "ICT Forward Lab",
  description: "BTCUSDT Futures forward-testing system",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#0b0f14] text-[#d1d4dc] antialiased">
        <LogoutButton />
        {children}
      </body>
    </html>
  );
}
