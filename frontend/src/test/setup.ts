import "@testing-library/jest-dom/vitest";

// jsdom does not implement matchMedia; report a desktop-sized screen.
window.matchMedia = (query: string) =>
  ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }) as unknown as MediaQueryList;
