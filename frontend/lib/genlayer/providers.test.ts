import { describe, expect, it, vi } from "vitest";

import {
  createWalletProviderRegistry,
  type Eip1193Provider,
  type Eip6963ProviderInfo,
} from "./providers";

function provider(flags: Partial<Eip1193Provider> = {}): Eip1193Provider {
  return {
    request: vi.fn(async () => []),
    on: vi.fn(),
    removeListener: vi.fn(),
    ...flags,
  };
}

class FakeProviderWindow extends EventTarget {
  ethereum?: Eip1193Provider & { providers?: Eip1193Provider[] };
  okxwallet?: Eip1193Provider;

  announce(info: Eip6963ProviderInfo, announcedProvider: Eip1193Provider) {
    this.dispatchEvent(new CustomEvent("eip6963:announceProvider", {
      detail: { info, provider: announcedProvider },
    }));
  }
}

const info = (uuid: string, name: string, rdns: string): Eip6963ProviderInfo => ({
  uuid,
  name,
  rdns,
  icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>",
});

describe("wallet provider registry", () => {
  it("keeps exact MetaMask and OKX providers while excluding Phantom", () => {
    const target = new FakeProviderWindow();
    const metamask = provider({ isMetaMask: true });
    const okx = provider({ isOkxWallet: true });
    const phantom = provider({ isPhantom: true });
    const registry = createWalletProviderRegistry(target);

    registry.start();
    target.announce(info("mm-1", "MetaMask", "io.metamask"), metamask);
    target.announce(info("okx-1", "OKX Wallet", "com.okex.wallet"), okx);
    target.announce(info("phantom-1", "Phantom", "app.phantom"), phantom);

    expect(registry.get("metamask")?.provider).toBe(metamask);
    expect(registry.get("okx")?.provider).toBe(okx);
    expect(registry.list().map((wallet) => wallet.id)).toEqual(["metamask", "okx"]);
  });

  it("rejects Phantom and lookalike announcements that spoof supported wallet names", () => {
    const target = new FakeProviderWindow();
    const phantomAsMetaMask = provider({ isMetaMask: true, isPhantom: true });
    const okxLookalike = provider();
    const registry = createWalletProviderRegistry(target);

    registry.start();
    target.announce(info("spoof-mm", "MetaMask", "app.phantom"), phantomAsMetaMask);
    target.announce(info("spoof-okx", "OKX Wallet", "wallet.okx-lookalike.example"), okxLookalike);

    expect(registry.list()).toEqual([]);
  });

  it("uses exact legacy providers and ignores an arbitrary window.ethereum", () => {
    const target = new FakeProviderWindow();
    const generic = provider();
    const metamask = provider({ isMetaMask: true });
    const okx = provider({ isOkxWallet: true });
    target.ethereum = Object.assign(generic, { providers: [generic, metamask, okx] });
    const registry = createWalletProviderRegistry(target);

    registry.start();

    expect(registry.get("metamask")?.provider).toBe(metamask);
    expect(registry.get("okx")?.provider).toBe(okx);
    expect(registry.list().some((wallet) => wallet.provider === generic)).toBe(false);
  });

  it("deduplicates repeated announcements and removes its listener on stop", () => {
    const target = new FakeProviderWindow();
    const metamask = provider({ isMetaMask: true });
    const registry = createWalletProviderRegistry(target);
    const listener = vi.fn();

    registry.subscribe(listener);
    registry.start();
    target.announce(info("mm-1", "MetaMask", "io.metamask"), metamask);
    target.announce(info("mm-1", "MetaMask", "io.metamask"), metamask);
    expect(registry.list()).toHaveLength(1);
    expect(listener).toHaveBeenCalledTimes(1);

    registry.stop();
    target.announce(info("okx-1", "OKX Wallet", "com.okex.wallet"), provider({ isOkxWallet: true }));
    expect(registry.get("okx")).toBeUndefined();
  });
});
