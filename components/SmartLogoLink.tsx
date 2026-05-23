"use client";

import Link from "next/link";

type Props = {
  loggedIn: boolean;
  className?: string;
};

export function SmartLogoLink({ loggedIn, className }: Props) {
  return (
    <Link href={loggedIn ? "/dashboard" : "/"} className={className}>
      Paid
    </Link>
  );
}
