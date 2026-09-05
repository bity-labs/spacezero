import "@testing-library/jest-dom/vitest";

class TestResizeObserver implements ResizeObserver {
  observe(): void {
    // jsdom does not implement layout observation.
  }
  unobserve(): void {
    // jsdom does not implement layout observation.
  }
  disconnect(): void {
    // jsdom does not implement layout observation.
  }
}

if (!("ResizeObserver" in globalThis)) {
  Object.defineProperty(globalThis, "ResizeObserver", {
    value: TestResizeObserver,
    configurable: true,
  });
}

Object.defineProperty(window, "scrollTo", {
  value: () => undefined,
  configurable: true,
});

Object.defineProperty(HTMLElement.prototype, "scrollTo", {
  value: () => undefined,
  configurable: true,
});
