class OnsetProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch && ch.length) {
      // Peak amplitude (max |sample|) per block — same metric the shot-counter app
      // triggers on, so its sensitivity/threshold levels transfer directly.
      let peak = 0;
      for (let i = 0; i < ch.length; i++) {
        const a = Math.abs(ch[i]);
        if (a > peak) peak = a;
      }
      this.port.postMessage(peak);
    }
    return true;
  }
}
registerProcessor('onset-processor', OnsetProcessor);
