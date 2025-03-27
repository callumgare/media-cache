export function clamp(min: number, value: number, max: number) {
  return Math.min(Math.max(value, min), max)
};

export function closestNumber(value: number, x: number, y: number) {
  return Math.abs(value - x) <= Math.abs(value - y) ? x : y
}

export function wrapNumber(value: number, max: number) {
  return (value % max + max) % max
}

// Taken from: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors/Cyclic_object_value
export function getObjectSanitizer(customReplacer?: (key: string, value: unknown) => unknown) {
  const ancestors: unknown[] = []
  const previouslySeen = new WeakMap()
  return function (key: string, value: unknown) {
    if (value === window) {
      return '[Window]'
    }
    if (typeof value !== 'object' || value === null) {
      return value
    }
    if (customReplacer) {
      value = customReplacer(key, value)
    }
    // `this` is the object that value is contained in,
    // i.e., its direct parent.
    while (ancestors.length > 0 && ancestors.at(-1) !== this) {
      ancestors.pop()
    }
    if (ancestors.includes(value)) {
      return '[Circular]'
    }
    ancestors.push(value)
    if (value && typeof value === 'object') {
      if (previouslySeen.has(value)) {
        return previouslySeen.get(value)
      }
      else {
        previouslySeen.set(value, `[previous - ${key}]`)
      }
    }
    return value
  }
}
