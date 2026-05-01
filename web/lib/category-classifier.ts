/**
 * Map a market to one of the picker's six pill categories:
 *   "All" | "Crypto" | "Sports" | "AI/Tech" | "Politics" | "Misc"
 *
 * Primary path: trust the SDK-provided `category` field (crypto,
 * sports, politics, culture, miscellaneous, economics) and map it to
 * a pill. Secondary path: classify from the question text via
 * keywords. The keyword pass is defensive — Delphi reliably tags
 * categories — but kicks in for any market with a missing or
 * unrecognised category.
 */

export type PillCategory =
  | "All"
  | "Crypto"
  | "Sports"
  | "AI/Tech"
  | "Politics"
  | "Misc";

const SDK_TO_PILL: Record<string, PillCategory> = {
  crypto: "Crypto",
  sports: "Sports",
  politics: "Politics",
  culture: "AI/Tech",
  miscellaneous: "Misc",
  economics: "Misc",
};

interface KeywordRule {
  pill: PillCategory;
  patterns: RegExp[];
}

// Order matters — first match wins. Crypto-specific tokens checked
// before Sports because "ETH" can show up in soccer context, but our
// crypto matchers are tighter.
const KEYWORD_RULES: KeywordRule[] = [
  {
    pill: "Crypto",
    patterns: [
      /\b(BTC|ETH|SOL|XRP|crypto|bitcoin|ethereum|stablecoin|defi|tvl|exploit|hack|altcoin|memecoin|onchain|on-chain|web3|x402|microstrategy|coinbase)\b/i,
      /\$\d+[KMB]?\s+(market\s+cap|exploit)/i,
    ],
  },
  {
    pill: "Sports",
    patterns: [
      /\b(NBA|NFL|NHL|MLB|F1|UEFA|FIFA|World Cup|Premier League|Champions League|La Liga|Bundesliga|Stanley Cup|Super Bowl|tennis|golf|cricket|IPL|Open|Wimbledon|Olympics|Olympic|Drivers' Champion|Constructors)\b/,
      /\b(Lakers|Celtics|Warriors|Thunder|Bayern|Madrid|Barcelona|Arsenal|PSG|Manchester|Liverpool|Chelsea|Argentina|Brazil|England|France|Spain|Germany)\b/,
    ],
  },
  {
    pill: "Politics",
    patterns: [
      /\b(election|president|congress|senate|vote|treaty|peace deal|war|sanctions|inflation|FOMC|fed|federal reserve|tariff|impeachment|prime minister|geopolitic)/i,
      /\b(Trump|Biden|Putin|Xi|Iran|Russia|Ukraine|Israel|Gaza|China|EU)\b/,
    ],
  },
  {
    pill: "AI/Tech",
    patterns: [
      /\b(GPT|Claude|LLM|AI|model|OpenAI|Anthropic|Sora|Gemini|chatbot)\b/,
      /\b(PS5|PS6|XBox|Nintendo|Switch|Steam|GTA|Bethesda|Sony|Microsoft|Apple|Tesla|SpaceX|Disney\+|Netflix|Marvel|Avengers|Star Wars|Star Trek|MrBeast|Mr\. Beast|YouTube|TikTok)\b/i,
      /\b(launch|release|announce|delayed|update|version)\b.*\b(202[5-9]|game|movie|TV|show|sequel|reboot|console)/i,
    ],
  },
  {
    pill: "Misc",
    patterns: [/.*/], // catch-all
  },
];

/**
 * Classify a market into a pill category.
 *
 * @param sdkCategory  The SDK's `category` string. May be empty/missing.
 * @param question     The market question text. Falls through to keyword
 *                     classification when sdkCategory doesn't map.
 */
export function classifyMarket(
  sdkCategory: string | undefined | null,
  question: string,
): PillCategory {
  if (sdkCategory) {
    const mapped = SDK_TO_PILL[sdkCategory.toLowerCase()];
    if (mapped) return mapped;
  }
  for (const rule of KEYWORD_RULES) {
    for (const pat of rule.patterns) {
      if (pat.test(question)) return rule.pill;
    }
  }
  return "Misc";
}
