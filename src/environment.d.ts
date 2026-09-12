declare global {
  namespace NodeJS {
    interface ProcessEnv {
      PAYLOAD_SECRET: string
      DATABASE_URL: string
      NEXT_PUBLIC_SERVER_URL: string
      VERCEL_PROJECT_PRODUCTION_URL: string
      VERCEL_ENV?: 'production' | 'preview' | 'development'
      PREVIEW_SECRET: string
      CRON_SECRET?: string
      DEFAULT_TENANT_SLUG?: string
      ALLOWED_ORIGINS?: string
      BLOB_READ_WRITE_TOKEN?: string
      RESEND_API_KEY?: string
      EMAIL_FROM_ADDRESS?: string
      EMAIL_FROM_NAME?: string
      CONTACT_INBOX?: string
    }
  }
}

// If this file has no import/export statements (i.e. is a script)
// convert it into a module by adding an empty export statement.
export {}
