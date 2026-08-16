export {};

declare global {
  interface Window {
    readonly spacezero: {
      readonly getAppVersion: () => Promise<string>;
    };
  }
}
