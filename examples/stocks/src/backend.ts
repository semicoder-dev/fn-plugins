import { defineBackend } from "@semicoder/fn-sdk/backend";
import { defineContract } from "@semicoder/fn-sdk/contract";
export default defineBackend({
  api: defineContract({}),
  async setup({ host }) {
    const values = [100, 101.2, 100.4, 102.1, 101.8, 103.3, 102.9];
    let index = 0,
      stopped = false;
    const publish = async () => {
      if (stopped) return;
      const value = values[index++ % values.length]!;
      await host.application
        .setSummary({
          version: 1,
          text: { key: "demo" },
          metrics: [{ label: { key: "price" }, value: value.toFixed(2) }],
          sparkline: { values, tone: "success" },
        })
        .catch((error) => console.error("Summary update failed", error));
    };
    await publish();
    const timer = setInterval(() => void publish().catch(() => {}), 3000);
    return {
      handlers: {},
      stop() {
        stopped = true;
        clearInterval(timer);
      },
    };
  },
});
