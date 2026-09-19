import '@testing-library/jest-dom'

// jsdom doesn't implement matchMedia. Components that pick a render path based
// on viewport width (see hooks/useMediaQuery) need it defined, and defaulting
// `matches` to false keeps every existing test on the desktop render path
// unless a test explicitly overrides window.matchMedia to simulate mobile.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList
}
