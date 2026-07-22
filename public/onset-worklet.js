class OnsetProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch && ch.length) {
      let s = 0;
      for (let i = 0; i < ch.length; i++) s += ch[i] * ch[i];
      this.port.postMessage(Math.sqrt(s / ch.length));
    }
    return true;
  }
}
registerProcessor('onset-processor', OnsetProcessor);
