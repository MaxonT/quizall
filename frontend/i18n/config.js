export const i18nConfig = {
  supportedLocales: [
    'en', 'zh-CN', 'es', 'fr', 'ja', 'ko', 'ar', 'pt', 'hi'
  ],
  localeLabels: {
    en: 'English',
    'zh-CN': '中文',
    es: 'Español',
    fr: 'Français',
    ja: '日本語',
    ko: '한국어',
    ar: 'العربية',
    pt: 'Português',
    hi: 'हिन्दी'
  },
  defaultLocale: 'en',
  fallbackLocale: 'en',
  cache: {
    enabled: true,
    expiration: 24 * 60 * 60 * 1000, // 24 hours
    prefix: 'i18n_cache_v3_'
  }
};
