// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WalletChooserDialog } from "./WalletChooserDialog";
import type { WalletOption } from "../../lib/genlayer/WalletProvider";

afterEach(cleanup);

const wallets: WalletOption[] = [
  { id: "metamask", name: "MetaMask", installed: true, installUrl: "https://metamask.io/download/" },
  { id: "okx", name: "OKX Wallet", installed: true, installUrl: "https://www.okx.com/web3" },
];

describe("WalletChooserDialog", () => {
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
    render(<WalletChooserDialog open onOpenChange={() => undefined}
      wallets={wallets} pendingWalletId="metamask" onSelect={() => undefined} />);

    expect((screen.getByRole("button", { name: "Connecting MetaMask" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Connect OKX Wallet" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("closes from its accessible close control", () => {
    const onOpenChange = vi.fn();
    render(<WalletChooserDialog open onOpenChange={onOpenChange}
      wallets={wallets} pendingWalletId={null} onSelect={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Close wallet chooser" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
