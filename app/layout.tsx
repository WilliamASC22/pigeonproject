import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PigeonProject 🕊️",
  description:
    "PigeonProject is a privacy-focused messenger app with direct chats, group chats, encrypted saved messages, emoji support, and browser-based calling.",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}