import { i18nConfig } from './config.js';

export class TranslationCache {
  constructor() {
    this.prefix = i18nConfig.cache.prefix;
    this.expiration = i18nConfig.cache.expiration;
  }

  get(locale) {
    if (!i18nConfig.cache.enabled) return null;

    try {
      const key = `${this.prefix}${locale}`;
      const cached = localStorage.getItem(key);
      
      if (!cached) return null;

      const { data, timestamp, version } = JSON.parse(cached);

      // Check expiration
      if (Date.now() - timestamp > this.expiration) {
        localStorage.removeItem(key);
        return null;
      }

      // Optional: Add version check here if needed in future
      
      console.log(`[i18n] Cache hit for ${locale}`);
      return data;
    } catch (e) {
      console.warn('[i18n] Cache retrieval failed', e);
      return null;
    }
  }

  set(locale, data) {
    if (!i18nConfig.cache.enabled) return;

    try {
      const key = `${this.prefix}${locale}`;
      const cacheEntry = {
        data,
        timestamp: Date.now(),
        version: '1.0'
      };
      localStorage.setItem(key, JSON.stringify(cacheEntry));
    } catch (e) {
      console.warn('[i18n] Cache storage failed (quota exceeded?)', e);
    }
  }

  clear() {
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith(this.prefix)) {
        localStorage.removeItem(key);
      }
    });
  }
}
