export { default as serialize } from "serialize-javascript";

export function deserialize(serializedJavascript: string): unknown {
  // new Function avoids global eval's access to local scope while still handling
  // serialize-javascript output (which may include Dates, RegExps, etc.)
  return new Function(`return (${serializedJavascript})`)();
}
