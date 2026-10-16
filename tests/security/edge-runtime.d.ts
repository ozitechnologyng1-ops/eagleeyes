declare namespace Deno {
  const env: { get(name: string): string | undefined };
  function serve(handler: (request: Request) => Response | Promise<Response>): void;
}
declare module "jsr:@supabase/functions-js/edge-runtime.d.ts";
