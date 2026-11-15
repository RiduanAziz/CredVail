/* eslint-disable @typescript-eslint/no-explicit-any */
declare module "next/link" {
  import * as React from "react";
  export interface LinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
    href: string;
    as?: string;
    replace?: boolean;
    scroll?: boolean;
    shallow?: boolean;
    passHref?: boolean;
    prefetch?: boolean;
  }
  const Link: React.ForwardRefExoticComponent<LinkProps & React.RefAttributes<HTMLAnchorElement>>;
  export default Link;
}

declare module "next/navigation" {
  export function useRouter(): {
    push(url: string): void;
    replace(url: string): void;
    refresh(): void;
    back(): void;
    forward(): void;
    prefetch(url: string): void;
  };
  export function usePathname(): string;
  export function useSearchParams(): URLSearchParams;
}

declare module "next/server" {
  export class NextRequest extends Request {
    cookies: {
      get(name: string): { name: string; value: string } | undefined;
      set(name: string, value: string): void;
      delete(name: string): void;
      has(name: string): boolean;
    };
    nextUrl: URL;
  }
  export class NextResponse extends Response {
    static json<T = any>(body: T, init?: ResponseInit): NextResponse;
    static redirect(url: string | URL, status?: number): NextResponse;
    static next(init?: ResponseInit): NextResponse;
  }
}

declare module "next" {
  export type Metadata = Record<string, any>;
}

declare module "next/types.js" {
  export type Metadata = Record<string, any>;
  export type ResolvingMetadata = any;
  export type ResolvingViewport = any;
}

declare module "next/server.js" {
  export * from "next/server";
}

declare module "next/dist/lib/metadata/types/metadata-interface.js" {
  export type Metadata = Record<string, any>;
  export type ResolvingMetadata = any;
  export type ResolvingViewport = any;
}
