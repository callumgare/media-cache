export function clamp(min: number, value: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function closestNumber(value: number, x: number, y: number) {
  return Math.abs(value - x) <= Math.abs(value - y) ? x : y;
}

export function wrapNumber(value: number, max: number) {
  return ((value % max) + max) % max;
}

// Taken from: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors/Cyclic_object_value
export function getObjectSanitizer(
  customReplacer?: (key: string, value: unknown) => unknown,
) {
  const ancestors: unknown[] = [];
  const previouslySeen = new WeakMap();
  return function (this: object, key: string, value: unknown) {
    if (value === window) {
      return "[Window]";
    }
    if (typeof value !== "object" || value === null) {
      return value;
    }
    const resolvedValue = customReplacer ? customReplacer(key, value) : value;
    // `this` is the object that value is contained in,
    // i.e., its direct parent.
    while (ancestors.length > 0 && ancestors.at(-1) !== this) {
      ancestors.pop();
    }
    if (ancestors.includes(resolvedValue)) {
      return "[Circular]";
    }
    ancestors.push(resolvedValue);
    if (resolvedValue && typeof resolvedValue === "object") {
      if (previouslySeen.has(resolvedValue)) {
        return previouslySeen.get(resolvedValue);
      }

      previouslySeen.set(resolvedValue, `[previous - ${key}]`);
    }
    return resolvedValue;
  };
}
