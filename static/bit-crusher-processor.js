/**
 * Bit crusher: amplitude quantization + sample-and-hold (sample-rate reduction).
 * bitDepth 100 = bypass, 0 = solid crush (~2-bit, ~190 Hz hold at 48 kHz).
 */
class BitCrusherProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'bitDepth', defaultValue: 100, minValue: 0, maxValue: 100 }];
  }

  constructor() {
    super();
    /** @type {number[]} */
    this._holds = [0, 0];
    /** @type {number[]} */
    this._counters = [0, 0];
  }

  /**
   * @param {Float32Array[][]} inputs
   * @param {Float32Array[][]} outputs
   * @param {Record<string, Float32Array>} parameters
   */
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input?.[0]?.length) return true;

    const bitDepthParam = parameters.bitDepth;
    const blockSize = output[0].length;

    for (let ch = 0; ch < output.length; ch++) {
      const inCh = input[ch] || input[0];
      const outCh = output[ch];
      let hold = this._holds[ch] ?? 0;
      let counter = this._counters[ch] ?? 0;

      for (let i = 0; i < blockSize; i++) {
        const bitDepth = bitDepthParam.length > 1 ? bitDepthParam[i] : bitDepthParam[0];

        if (bitDepth >= 99.9) {
          outCh[i] = inCh[i];
          continue;
        }

        const norm = bitDepth / 100;
        // ~2 bits at 0%, 16 bits at 100%.
        const bits = Math.pow(2, 1 + norm * 3);
        const steps = Math.max(1, Math.pow(2, Math.floor(bits)) - 1);
        // Sample hold: up to 256× decimation at 0% (~190 Hz at 48 kHz).
        const holdFactor = Math.max(1, Math.floor(Math.pow(2, (1 - norm) * 8)));

        if (counter % holdFactor === 0) {
          const s = inCh[i];
          hold = Math.round(s * steps) / steps;
        }
        counter++;
        outCh[i] = hold;
      }

      this._holds[ch] = hold;
      this._counters[ch] = counter;
    }
    return true;
  }
}

registerProcessor('bit-crusher-processor', BitCrusherProcessor);
