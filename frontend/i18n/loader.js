import { TranslationCache } from './cache.js';

export class TranslationLoader {
  constructor() {
    this.cache = new TranslationCache();
    this.loading = new Map();
  }

  async load(locale) {
    // 1. Try cache
    const cached = this.cache.get(locale);
    if (cached) return cached;

    // 2. Dedup requests
    if (this.loading.has(locale)) {
      return this.loading.get(locale);
    }

    // 3. Fetch from network
    const promise = this._fetch(locale);
    this.loading.set(locale, promise);

    try {
      const data = await promise;
      this.cache.set(locale, data);
      return data;
    } finally {
      this.loading.delete(locale);
    }
  }

  async _fetch(locale) {
    try {
      const response = await fetch(`locales/${locale}.json`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (e) {
      console.error(`[i18n] Failed to load translations for ${locale}`, e);
      throw e;
    }
  }
}
