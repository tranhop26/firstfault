export type WalletId = "metamask" | "okx";

export interface Eip1193Provider {
  isMetaMask?: boolean;
  isOkxWallet?: boolean;
  isPhantom?: boolean;
  providers?: Eip1193Provider[];
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on(event: string, handler: (...args: any[]) => void): void;
  removeListener(event: string, handler: (...args: any[]) => void): void;
}

export interface Eip6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

interface Eip6963ProviderDetail {
  info: Eip6963ProviderInfo;
  provider: Eip1193Provider;
}

export interface WalletProviderRecord {
  id: WalletId;
  name: "MetaMask" | "OKX Wallet";
  provider: Eip1193Provider;
  info?: Eip6963ProviderInfo;
}

export interface ProviderEventTarget extends EventTarget {
  ethereum?: Eip1193Provider;
  okxwallet?: Eip1193Provider;
}

export interface WalletProviderRegistry {
  start(): void;
  stop(): void;
  list(): WalletProviderRecord[];
  get(id: WalletId): WalletProviderRecord | undefined;
  subscribe(listener: (wallets: WalletProviderRecord[]) => void): () => void;
}

const walletName = (id: WalletId): WalletProviderRecord["name"] => (
  id === "metamask" ? "MetaMask" : "OKX Wallet"
);

function classifyAnnouncement(
  info: Eip6963ProviderInfo,
  provider: Eip1193Provider,
): WalletId | null {
  if (provider.isPhantom) return null;
  const rdns = info.rdns.toLowerCase();
  if (rdns === "io.metamask") return "metamask";
  if (rdns === "com.okex.wallet") return "okx";
  return null;
}

function classifyLegacy(provider: Eip1193Provider): WalletId | null {
  if (provider.isPhantom) return null;
  if (provider.isOkxWallet) return "okx";
  if (provider.isMetaMask) return "metamask";
  return null;
}

export function createWalletProviderRegistry(target: ProviderEventTarget): WalletProviderRegistry {
  const records = new Map<WalletId, WalletProviderRecord>();
  const announcementIds = new Set<string>();
  const disqualifiedLegacyProviders = new WeakSet<Eip1193Provider>();
  const listeners = new Set<(wallets: WalletProviderRecord[]) => void>();
  let started = false;

  const list = () => (["metamask", "okx"] as WalletId[])
    .flatMap((id) => records.has(id) ? [records.get(id)!] : []);

  const notify = () => {
    const wallets = list();
    listeners.forEach((listener) => listener(wallets));
  };

  const add = (id: WalletId, provider: Eip1193Provider, info?: Eip6963ProviderInfo) => {
    const existing = records.get(id);
    if (existing?.provider === provider) return;
    records.set(id, { id, name: walletName(id), provider, info });
    notify();
  };

  const handleAnnouncement = (event: Event) => {
    const detail = (event as CustomEvent<Eip6963ProviderDetail>).detail;
    if (!detail?.info || !detail.provider || announcementIds.has(detail.info.uuid)) return;
    announcementIds.add(detail.info.uuid);
    const id = classifyAnnouncement(detail.info, detail.provider);
    if (id) {
      add(id, detail.provider, detail.info);
      return;
    }

    disqualifiedLegacyProviders.add(detail.provider);
    let removed = false;
    for (const [recordId, record] of records) {
      if (record.provider === detail.provider && !record.info) {
        records.delete(recordId);
        removed = true;
      }
    }
    if (removed) notify();
  };

  const addLegacyProviders = () => {
    const injected = target.ethereum;
    const candidates = [
      ...(injected?.providers ?? []),
      ...(injected ? [injected] : []),
      ...(target.okxwallet ? [target.okxwallet] : []),
    ];
    for (const provider of candidates) {
      if (disqualifiedLegacyProviders.has(provider)) continue;
      const id = classifyLegacy(provider);
      if (id && !records.has(id)) add(id, provider);
    }
  };

  return {
    start() {
      if (started) return;
      started = true;
      target.addEventListener("eip6963:announceProvider", handleAnnouncement);
      addLegacyProviders();
      target.dispatchEvent(new Event("eip6963:requestProvider"));
    },
    stop() {
      if (!started) return;
      started = false;
      target.removeEventListener("eip6963:announceProvider", handleAnnouncement);
    },
    list,
    get(id) {
      return records.get(id);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

let browserRegistry: WalletProviderRegistry | null = null;

export function getBrowserWalletProviderRegistry(): WalletProviderRegistry | null {
  if (typeof window === "undefined") return null;
  if (!browserRegistry) browserRegistry = createWalletProviderRegistry(window as ProviderEventTarget);
  return browserRegistry;
}
