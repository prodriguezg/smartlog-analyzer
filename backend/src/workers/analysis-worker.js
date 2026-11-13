const pollIntervalMs = 1_000;

export function startAnalysisWorker(service) {
  let stopped = false;
  let timer;
  let inFlight;

  async function run() {
    let delay = pollIntervalMs;
    try {
      if (await service.processNextAnalysis()) delay = 0;
    } catch (error) {
      console.error("Error processing pending analysis:", error);
    }

    if (!stopped) timer = setTimeout(tick, delay);
  }

  function tick() {
    inFlight = run();
  }

  tick();
  return async function stop() {
    stopped = true;
    clearTimeout(timer);
    await inFlight;
  };
}
