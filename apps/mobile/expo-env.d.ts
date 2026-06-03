/// <reference types="expo/types" />

// Metro injects `process.env.EXPO_PUBLIC_*` at build time. React Native has no
// Node runtime, so we declare a minimal `process.env` for typechecking rather
// than pulling in all of @types/node's globals.
declare global {
  // eslint-disable-next-line no-var
  var process: { env: Record<string, string | undefined> };
}

export {};
