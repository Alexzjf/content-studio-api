/**
 * Round-robin Gemini keys with short cooldown after rate-limit errors.
 */
export function parseApiKeys(raw) {
  return String(raw || "")
    .split(/[,;\n]+/)
    .map((k) => k.trim())
    .filter(Boolean);
}

export function createKeyPool(keys) {
  const unique = [...new Set(keys)];
  if (!unique.length) {
    throw new Error("No Gemini API keys configured");
  }

  let cursor = Math.floor(Math.random() * unique.length);
  const cooldownUntil = new Map();

  function order() {
    const now = Date.now();
    const ready = [];
    const cooling = [];
    for (let i = 0; i < unique.length; i++) {
      const until = cooldownUntil.get(i) || 0;
      if (until <= now) ready.push(i);
      else cooling.push(i);
    }
    const rotated = [];
    for (let n = 0; n < ready.length; n++) {
      rotated.push(ready[(cursor + n) % ready.length]);
    }
    return [...rotated, ...cooling];
  }

  return {
    size: unique.length,
    get(index) {
      return unique[index];
    },
    pickOrder() {
      return order();
    },
    onSuccess(index) {
      cursor = (index + 1) % unique.length;
      cooldownUntil.delete(index);
    },
    onRateLimit(index, ms = 45000) {
      cooldownUntil.set(index, Date.now() + ms);
    },
    onInvalid(index) {
      cooldownUntil.set(index, Date.now() + 10 * 60 * 1000);
    },
  };
}
