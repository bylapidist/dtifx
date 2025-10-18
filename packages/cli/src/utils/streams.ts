export const isInteractiveStream = (
  stream: NodeJS.WritableStream,
): stream is NodeJS.WriteStream & {
  readonly isTTY: boolean | undefined;
} =>
  'isTTY' in stream &&
  (stream as NodeJS.WriteStream).isTTY !== undefined &&
  Boolean((stream as NodeJS.WriteStream).isTTY);
