interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
  readonly BASE_URL: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_CLIENT_BRAND?: string;
  readonly VITE_EGAB_KEY?: string;
  readonly VITE_EGAB_SECRET?: string;
  readonly VITE_EGAB_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.png" {
  const url: string;
  export default url;
}

declare module "*.css" {}
