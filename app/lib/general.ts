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
  maxDepth = 10,
) {
  const ancestors: unknown[] = [];
  const ancestorKeys: string[] = [];
  const previouslySeen = new WeakMap();
  let maxDepthWarningLogged = false;
  return function (this: object, key: string, value: unknown) {
    if (value === window) {
      return "[Window]";
    }
    if (value instanceof HTMLElement) {
      return `[HTMLElement - ${value.tagName.toLowerCase()}${value.id ? `#${value.id}` : ""}${value.className ? `.${value.className.split(" ").join(".")}` : ""}]`;
    }
    if (typeof value !== "object" || value === null) {
      return value;
    }
    const resolvedValue = customReplacer ? customReplacer(key, value) : value;
    // `this` is the object that value is contained in,
    // i.e., its direct parent.
    while (ancestors.length > 0 && ancestors.at(-1) !== this) {
      ancestors.pop();
      ancestorKeys.pop();
    }
    if (ancestors.length >= maxDepth) {
      if (!maxDepthWarningLogged) {
        const path = [...ancestorKeys, key].filter((k) => k !== "").join(".");
        console.warn(
          "getObjectSanitizer: max depth reached when trying to serialize object",
          { path, value, root: ancestors[0] },
        );
        maxDepthWarningLogged = true;
      }
      return "[Max depth reached]";
    }
    if (ancestors.includes(resolvedValue)) {
      return "[Circular]";
    }
    ancestors.push(resolvedValue);
    ancestorKeys.push(key);
    if (resolvedValue && typeof resolvedValue === "object") {
      if (previouslySeen.has(resolvedValue)) {
        return previouslySeen.get(resolvedValue);
      }

      previouslySeen.set(resolvedValue, `[previous - ${key}]`);
    }
    return resolvedValue;
  };
}
