import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TalkTalk",
  description: "사내 채팅 서비스",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
