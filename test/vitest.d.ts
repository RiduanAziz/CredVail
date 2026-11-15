declare module "vitest" {
  export const describe: any;
  export const it: any;
  export const expect: any;
  export const beforeEach: any;
  export const afterEach: any;
  export const beforeAll: any;
  export const afterAll: any;
  export const vi: any;
}

declare module "vitest/config" {
  export const defineConfig: any;
}

declare module "tailwindcss" {
  export interface Config {
    [key: string]: any;
  }
}

