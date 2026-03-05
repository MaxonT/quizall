import { i18nConfig } from './config.js';

export class LanguageDetector {
  detect() {
    // 1. Check localStorage (user preference)
    const stored = localStorage.getItem('locale');
    if (stored && i18nConfig.supportedLocales.includes(stored)) {
      return stored;
    }

    // 2. Check browser language
    const browserLang = navigator.language || navigator.userLanguage;
    const normalized = this.normalize(browserLang);
    
    if (i18nConfig.supportedLocales.includes(normalized)) {
      return normalized;
    }

    // 3. Fallback
    return i18nConfig.defaultLocale;
  }

  normalize(langCode) {
    // Handle zh-CN, zh-TW, en-US, etc.
    if (langCode === 'zh' || langCode.startsWith('zh-')) {
      return 'zh-CN'; // Currently only support zh-CN
    }
    
    // For others, try strict match or just language code
    if (i18nConfig.supportedLocales.includes(langCode)) {
      return langCode;
    }
    
    const shortCode = langCode.split('-')[0];
    if (i18nConfig.supportedLocales.includes(shortCode)) {
      return shortCode;
    }

    return langCode;
  }
}
