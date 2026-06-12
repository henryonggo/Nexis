declare global {
  // eslint-disable-next-line no-var
  var process: { env: Record<string, string | undefined> };
}

export {};
