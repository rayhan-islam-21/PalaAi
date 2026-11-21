import { MODEL_PRICES } from "@/lib/models";
import { TokenCalc } from "./TokenCalc";

export default function TokensPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="h1">Token calculator</h1>
        <p className="muted mt-1">
          Paste what a customer would type and a typical AI answer to see how many tokens it is and what it costs you on each model. Prices used:{" "}
          {MODEL_PRICES.map((m) => `${m.label} $${m.input} in / $${m.output} out per million tokens`).join(" · ")}.
        </p>
      </div>
      <TokenCalc />
    </div>
  );
}
