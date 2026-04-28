/**
 * Static loader for demo-markets.json. Imported via JSON ESM (assert),
 * which Next.js 14 supports via webpack. Re-exports the markets array
 * with the canonical DemoMarket shape so client components can import
 * cleanly without hitting the API.
 */

import demoMarkets from "../../demo-markets.json";
import type { DemoMarket } from "./types";

interface DemoFile {
  network?: string;
  markets: DemoMarket[];
}

const data = demoMarkets as unknown as DemoFile;

export const DEMO_MARKETS: DemoMarket[] = data.markets ?? [];
export const DEMO_NETWORK: string | undefined = data.network;
