/// <reference types="vite/client" />

declare module '*.vue' {
  import type { Component } from 'vue';
  const component: Component;
  export default component;
}

// Compile-time constants injected by vite.config.ts's `define`. Vite
// substitutes these as string literals at build time — they aren't
// real variables and don't survive into runtime as such.
declare const __APP_VERSION__: string;
declare const __BUILD_ID__: string;
