import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reset password — Paid",
  description: "Set a new password for your Paid account.",
};

export default function ResetPasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
