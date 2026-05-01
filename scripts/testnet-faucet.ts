/**
 * Claim testnet USDC (MockToken) from the Gensyn testnet faucet.
 * Usage: npx tsx scripts/testnet-faucet.ts
 */
import { client } from "./client.js";

const FAUCET_ADDRESS = "0xB5876320DdA1AEE3eFC03aD02dC2e2CB4b61B7D9" as const;
const FAUCET_ABI = [{
  name: "requestToken",
  type: "function",
  inputs: [],
  outputs: [],
  stateMutability: "nonpayable",
}] as const;

const { address, walletClient, publicClient } = await client.getSigner();

console.log("Wallet: " + address);
console.log("Faucet: " + FAUCET_ADDRESS);

const tokenAddress = client.getTokenAddress();
const balanceBefore = await client.getErc20Balance();
console.log("\nBalance before: " + (Number(balanceBefore) / 1e6).toFixed(6) + " USDC (" + tokenAddress + ")");

console.log("\nClaiming from faucet...");
const hash = await walletClient.writeContract({
  address: FAUCET_ADDRESS,
  abi: FAUCET_ABI,
  functionName: "requestToken",
});
console.log("Transaction: " + hash);

const receipt = await publicClient.waitForTransactionReceipt({ hash });
if (receipt.status === "reverted") {
  console.error("Faucet transaction reverted. No USDC was minted.");
  process.exit(1);
}

const balanceAfter = await client.getErc20Balance();
console.log("Balance after:  " + (Number(balanceAfter) / 1e6).toFixed(6) + " USDC");
console.log("Received:       " + (Number(balanceAfter - balanceBefore) / 1e6).toFixed(6) + " USDC");
