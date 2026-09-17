// @vitest-environment jsdom
import { useEffect, useRef, useState } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WalletChooserDialog } from "./WalletChooserDialog";
import type { WalletOption } from "../../lib/genlayer/WalletProvider";

afterEach(cleanup);

const wallets: WalletOption[] = [
  { id: "metamask", name: "MetaMask", installed: true, installUrl: "https://metamask.io/download/" },
  { id: "okx", name: "OKX Wallet", installed: true, installUrl: "https://www.okx.com/web3" },
];

const appCss = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");

describe("WalletChooserDialog", () => {
  it("keeps the portalled chooser fixed, centered, and above its overlay", () => {
    const style = document.createElement("style");
    style.textContent = appCss;
    document.head.append(style);
    render(<WalletChooserDialog open onOpenChange={() => undefined}
      wallets={wallets} pendingWalletId={null} onSelect={() => undefined} />);

    const dialog = screen.getByRole("dialog", { name: "Choose a wallet" });
    const overlay = document.querySelector(".ff-modal-backdrop");
    const dialogStyle = getComputedStyle(dialog);
    const overlayStyle = getComputedStyle(overlay!);

    expect(dialog.parentElement).toBe(document.body);
    expect(dialogStyle.position).toBe("fixed");
    expect(dialogStyle.top).toBe("50%");
    expect(dialogStyle.left).toBe("50%");
    expect(dialogStyle.transform).toBe("translate(-50%,-50%)");
    expect(Number(dialogStyle.zIndex)).toBeGreaterThan(Number(overlayStyle.zIndex));
    style.remove();
  });

  it("offers both supported wallets and selects only the requested wallet", () => {
    const onSelect = vi.fn();
    render(<WalletChooserDialog open onOpenChange={() => undefined}
      wallets={wallets} pendingWalletId={null} onSelect={onSelect} />);

    expect(screen.getByRole("dialog", { name: "Choose a wallet" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Connect OKX Wallet" }));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith("okx");
  });

  it("shows an installation link instead of connecting a missing wallet", () => {
    const onSelect = vi.fn();
    render(<WalletChooserDialog open onOpenChange={() => undefined}
      wallets={[wallets[0], { ...wallets[1], installed: false }]}
      pendingWalletId={null} onSelect={onSelect} />);

    expect(screen.getByRole("link", { name: "Install OKX Wallet" }).getAttribute("href"))
      .toBe("https://www.okx.com/web3");
    expect(screen.queryByRole("button", { name: "Connect OKX Wallet" })).toBeNull();
  });

  it("disables both choices while the selected wallet is connecting", () => {
    const onOpenChange = vi.fn();
    render(<WalletChooserDialog open onOpenChange={onOpenChange}
      wallets={wallets} pendingWalletId="metamask" onSelect={() => undefined} />);

    expect((screen.getByRole("button", { name: "Connecting MetaMask" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Connect OKX Wallet" }) as HTMLButtonElement).disabled).toBe(true);
    const close = screen.getByRole("button", { name: "Close wallet chooser" }) as HTMLButtonElement;
    expect(close.disabled).toBe(false);
    fireEvent.click(close);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("closes from its accessible close control", () => {
    const onOpenChange = vi.fn();
    render(<WalletChooserDialog open onOpenChange={onOpenChange}
      wallets={wallets} pendingWalletId={null} onSelect={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Close wallet chooser" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("moves focus into the dialog and returns it to the opener after Escape", async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return <>
        <button onClick={() => setOpen(true)}>Open wallet chooser</button>
        <WalletChooserDialog open={open} onOpenChange={setOpen}
          wallets={wallets} pendingWalletId={null} onSelect={() => undefined} />
      </>;
    }

    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Open wallet chooser" });
    opener.focus();
    fireEvent.click(opener);

    const dialog = await screen.findByRole("dialog", { name: "Choose a wallet" });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    fireEvent.keyDown(document.activeElement ?? dialog, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it("returns focus to the connected wallet control when success replaces the opener", async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      const [connected, setConnected] = useState(false);
      const walletControlRef = useRef<HTMLButtonElement>(null);
      useEffect(() => {
        if (!open && connected) walletControlRef.current?.focus();
      }, [connected, open]);
      return <>
        {connected
          ? <button key="disconnect" ref={walletControlRef}>Disconnect</button>
          : <button key="connect" ref={walletControlRef} onClick={() => setOpen(true)}>Connect wallet</button>}
        <WalletChooserDialog
          open={open}
          onOpenChange={setOpen}
          wallets={wallets}
          pendingWalletId={null}
          onSelect={() => {
            setConnected(true);
            setOpen(false);
          }}
        />
      </>;
    }

    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Connect wallet" });
    fireEvent.click(opener);
    fireEvent.click(await screen.findByRole("button", { name: "Connect OKX Wallet" }));

    const disconnect = await screen.findByRole("button", { name: "Disconnect" });
    await waitFor(() => expect(opener.isConnected).toBe(false));
    await waitFor(() => expect(document.activeElement).toBe(disconnect));
  });
});
