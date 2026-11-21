/** Pure pricing math. Money in integer poisha. */

export type Quote = {
  seats: number;
  poolAmount: number;
  sharePerMember: number; // usage allowance per member
  feePerMember: number;
  pricePerMember: number;
  totalPrice: number;
};

export function groupQuote(poolAmount: number, seats: number, feePerMember: number): Quote {
  if (seats !== 4 && seats !== 5) throw new Error("Seats must be 4 or 5");
  const share = Math.round(poolAmount / seats);
  const price = share + feePerMember;
  return {
    seats,
    poolAmount,
    sharePerMember: share,
    feePerMember,
    pricePerMember: price,
    totalPrice: price * seats,
  };
}

export type Rates = {
  inputUsdPerMTok: number;
  outputUsdPerMTok: number;
  usdToBdt: number;
};

const S = 10000n; // 4-decimal fixed point

function fx(n: number): bigint {
  return BigInt(Math.round(n * 10000));
}

/**
 * Our estimated provider cost in poisha (rounded up), from token usage.
 * tokens × USD/MTok = micro-USD; × BDT/USD = micro-BDT; / 10^4 = poisha.
 */
export function providerCostPoisha(rates: Rates, inputTokens: number, outputTokens: number): number {
  const microUsdScaled = BigInt(inputTokens) * fx(rates.inputUsdPerMTok) + BigInt(outputTokens) * fx(rates.outputUsdPerMTok); // ×1e4
  const microBdtScaled = microUsdScaled * fx(rates.usdToBdt); // ×1e8
  const divisor = S * S * S; // 1e4 (poisha) × 1e8 (scales)
  return Number((microBdtScaled + divisor - 1n) / divisor);
}

/** Customer charge = provider cost × (1 + markup%), rounded up to whole poisha. */
export function customerCharge(rates: Rates, markupPercent: number, inputTokens: number, outputTokens: number): number {
  const microUsdScaled = BigInt(inputTokens) * fx(rates.inputUsdPerMTok) + BigInt(outputTokens) * fx(rates.outputUsdPerMTok);
  const scaled = microUsdScaled * fx(rates.usdToBdt) * BigInt(100 + markupPercent);
  const divisor = S * S * S * 100n;
  return Number((scaled + divisor - 1n) / divisor);
}

/**
 * Largest output-token cap the user can afford after paying for the input,
 * given `available` poisha. Returns 0 if not even the input is affordable.
 */
export function affordableOutputTokens(
  rates: Rates,
  markupPercent: number,
  available: number,
  inputTokens: number,
  hardMax: number,
): number {
  const inputCharge = customerCharge(rates, markupPercent, inputTokens, 0);
  if (inputCharge > available) return 0;
  // Binary search the max output tokens whose total charge fits.
  let lo = 0;
  let hi = hardMax;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (customerCharge(rates, markupPercent, inputTokens, mid) <= available) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
