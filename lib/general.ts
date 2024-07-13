export { default as serialize } from 'serialize-javascript'

export function deserialize(serializedJavascript: string): unknown {
  return eval('(' + serializedJavascript + ')')
}
