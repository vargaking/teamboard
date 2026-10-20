/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origin of a separately hosted API, e.g. https://api.example.com. Empty/undefined = same origin. */
  readonly VITE_API_URL?: string;
}
