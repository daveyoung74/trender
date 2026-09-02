"use client";

import { BusyButton, useBusyStages } from "@/components/busy-button";
import { useEffect, useState } from "react";

export function ConfirmModal({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  stages,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  stages?: string[];
  onConfirm: () => void | boolean | Promise<void | boolean>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const waitingCopy = stages?.length ? stages : ["Working…"];
  const stage = useBusyStages(waitingCopy, busy);

  useEffect(() => {
    if (!open) setBusy(false);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <div className="w-full max-w-md border border-line bg-card p-6">
        <h2 id="confirm-title" className="text-xl text-fg">
          {title}
        </h2>
        <p className="mt-3 text-sm text-muted">{body}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            className="border border-line px-4 py-2 text-sm"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <BusyButton
            className="border border-hot px-4 py-2 text-sm text-hot"
            busy={busy}
            stage={stage}
            onClick={async () => {
              setBusy(true);
              try {
                const keepBusy = await onConfirm();
                if (!keepBusy) setBusy(false);
              } catch {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </BusyButton>
        </div>
      </div>
    </div>
  );
}
