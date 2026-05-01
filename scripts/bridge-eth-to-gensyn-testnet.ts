/**
 * Bridge ETH from Ethereum Sepolia to Gensyn Testnet via the OP Stack Canonical Bridge.
 * ETH arrives on Gensyn Testnet within a few minutes.
 * Usage: npx tsx scripts/bridge-eth-to-gensyn-testnet.ts <amount-eth>
 *
 * Example:
 *   npx tsx scripts/bridge-eth-to-gensyn-testnet.ts 0.0001
 */
import { createWalletClient, createPublicClient, http, parseEther, formatEther } from "viem";
import { sepolia } from "viem/chains";
import { client } from "./client.js";

const SEPOLIA_RPC = "https://ethereum-sepolia-rpc.publicnode.com";
const L1_STANDARD_BRIDGE = "0xaf99ffa3281548a1c30fcb443f066eaff2d297d4" as const;
const MIN_GAS_LIMIT = 200_000;

const L1_BRIDGE_ABI = [{
  name: "depositETH",
  type: "function",
  inputs: [
    { name: "_minGasLimit", type: "uint32" },
    { name: "_extraData", type: "bytes" },
  ],
  outputs: [],
  stateMutability: "payable",
}] as const;

const [, , amountStr] = process.argv;
if (!amountStr) {
  console.error("Usage: npx tsx scripts/bridge-eth-to-gensyn-testnet.ts <amount-eth>");
  process.exit(1);
}

const amount = parseEther(amountStr);

// Borrow the account from the Gensyn-configured wallet client and point it at Sepolia
const { address, walletClient: gensynWalletClient } = await client.getSigner();
const sepoliaWalletClient = createWalletClient({
  account: gensynWalletClient.account,
  chain: sepolia,
  transport: http(SEPOLIA_RPC),
});
const sepoliaPublicClient = createPublicClient({ chain: sepolia, transport: http(SEPOLIA_RPC) });

const ethBalance = await sepoliaPublicClient.getBalance({ address });
console.log("Wallet:          " + address);
console.log("Sepolia balance: " + formatEther(ethBalance) + " ETH");
console.log("Bridging:        " + amountStr + " ETH → Gensyn Testnet");
console.log("Bridge:          " + L1_STANDARD_BRIDGE);

if (ethBalance < amount) {
  console.error("\nInsufficient Sepolia ETH balance.");
  process.exit(1);
}

console.log("\nSubmitting deposit...");
const hash = await sepoliaWalletClient.writeContract({
  address: L1_STANDARD_BRIDGE,
  abi: L1_BRIDGE_ABI,
  functionName: "depositETH",
  args: [MIN_GAS_LIMIT, "0x"],
  value: amount,
});
console.log("Transaction: " + hash);
console.log("Waiting for Sepolia confirmation...");

const receipt = await sepoliaPublicClient.waitForTransactionReceipt({ hash });
if (receipt.status === "reverted") {
  console.error("Transaction reverted on Sepolia. No ETH was bridged.");
  process.exit(1);
}
console.log("Confirmed on Sepolia. ETH will arrive on Gensyn Testnet within a few minutes.");
console.log("Track on explorer: https://gensyn-testnet.explorer.alchemy.com/address/" + address);
