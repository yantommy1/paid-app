"use client";

import { LandingEmailForm } from "@/components/LandingEmailForm";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function AuthSignInModal({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        className="relative z-10 w-full max-w-md border border-[#E5E5E5] bg-white p-8 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-signin-title"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-sm text-[#6B6B6B] hover:text-[#0D0D0D]"
        >
          Close
        </button>
        <h2 id="auth-signin-title" className="pr-10 font-display text-2xl text-[#0D0D0D]">
          Sign in
        </h2>
        <p className="mt-2 text-sm text-[#6B6B6B]">
          Use your work email — magic link or password.
        </p>
        <div className="mt-6">
          <LandingEmailForm variant="light" intent="signin" />
        </div>
      </div>
    </div>
  );
}
