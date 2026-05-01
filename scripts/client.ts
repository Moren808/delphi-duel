/**
 * Shared DelphiClient for the funding scripts (testnet-faucet,
 * bridge-eth-to-gensyn-testnet). Constructs a write-capable client from
 * the same env vars the rest of this repo uses:
 *
 *   DELPHI_NETWORK              "mainnet" | "testnet" (default "testnet")
 *   DELPHI_API_ACCESS_KEY       required
 *   MAINNET_WALLET_PRIVATE_KEY  0x-prefixed 64-char hex
 *
 * Loads .env.local from the repo root automatically.
 */
import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DelphiClient, type Network } from "@delphi-duel/sdk";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, "..", ".env.local"), override: true });

const network = (process.env.DELPHI_NETWORK as Network | undefined) ?? "testnet";
const apiKey = process.env.DELPHI_API_ACCESS_KEY;
const privateKey = process.env.MAINNET_WALLET_PRIVATE_KEY;

if (!apiKey) throw new Error("DELPHI_API_ACCESS_KEY not set in .env.local");
if (!privateKey) throw new Error("MAINNET_WALLET_PRIVATE_KEY not set in .env.local");
if (!privateKey.startsWith("0x") || privateKey.length !== 66) {
  throw new Error("MAINNET_WALLET_PRIVATE_KEY must be 0x-prefixed 64-char hex");
}

export const client = new DelphiClient({
  network,
  apiKey,
  signerType: "private_key",
  privateKey: privateKey as `0x${string}`,
});

export async function getWalletAddress(): Promise<`0x${string}`> {
  const { address } = await client.getSigner();
  return address;
}
