"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useRef } from "react";
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
  const openerRef = useRef<HTMLElement | null>(null);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={onOpenChange}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="ff-modal-backdrop" />
        <Dialog.Content
          className="ff-modal ff-wallet-modal"
          onOpenAutoFocus={() => {
            openerRef.current = document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null;
          }}
          onCloseAutoFocus={(event) => {
            if (!openerRef.current?.isConnected) return;
            event.preventDefault();
            openerRef.current.focus();
          }}
        >
          <Dialog.Close
            className="ff-modal-close"
            aria-label="Close wallet chooser"
          >×</Dialog.Close>
          <span className="ff-eyebrow">Studio Next</span>
          <Dialog.Title>Choose a wallet</Dialog.Title>
          <Dialog.Description>
            Select the browser wallet that will connect and sign FirstFault transactions.
          </Dialog.Description>
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
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
