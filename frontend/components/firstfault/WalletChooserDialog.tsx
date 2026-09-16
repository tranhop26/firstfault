"use client";

import { useEffect } from "react";
import type { WalletOption } from "../../lib/genlayer/WalletProvider";
import type { WalletId } from "../../lib/genlayer/providers";

export function WalletChooserDialog({
  open,
  onOpenChange,
  wallets,
  pendingWalletId,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wallets: WalletOption[];
  pendingWalletId: WalletId | null;
  onSelect: (walletId: WalletId) => void | Promise<void>;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pendingWalletId) onOpenChange(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onOpenChange, open, pendingWalletId]);

  if (!open) return null;

  return (
    <div className="ff-modal-backdrop" role="presentation">
      <section className="ff-modal ff-wallet-modal" role="dialog" aria-modal="true" aria-labelledby="wallet-title">
        <button
          className="ff-modal-close"
          aria-label="Close wallet chooser"
          disabled={Boolean(pendingWalletId)}
          onClick={() => onOpenChange(false)}
        >×</button>
        <span className="ff-eyebrow">Studio Next</span>
        <h2 id="wallet-title">Choose a wallet</h2>
        <p>Select the browser wallet that will connect and sign FirstFault transactions.</p>
        <div className="ff-wallet-options">
          {wallets.map((wallet) => {
            const pending = pendingWalletId === wallet.id;
            return (
              <article className="ff-wallet-option" key={wallet.id}>
                <span className={`ff-wallet-icon ff-wallet-icon-${wallet.id}`} aria-hidden="true">
                  {wallet.id === "metamask" ? "M" : "O"}
                </span>
                <div>
                  <strong>{wallet.name}</strong>
                  <small>{wallet.installed ? "Detected in this browser" : "Not installed"}</small>
                </div>
                {wallet.installed ? (
                  <button
                    className="ff-button ff-button-primary"
                    disabled={Boolean(pendingWalletId)}
                    aria-label={pending ? `Connecting ${wallet.name}` : `Connect ${wallet.name}`}
                    onClick={() => void onSelect(wallet.id)}
                  >{pending ? "Connecting…" : "Connect"}</button>
                ) : (
                  <a
                    className="ff-wallet-install"
                    href={wallet.installUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Install ${wallet.name}`}
                  >Install</a>
                )}
              </article>
            );
          })}
        </div>
        <p className="ff-wallet-note">FirstFault will use only the wallet you select. Other browser wallets will not receive this request.</p>
      </section>
    </div>
  );
}
