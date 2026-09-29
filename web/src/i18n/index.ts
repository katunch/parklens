import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import { storage } from '../lib/storage';
import de from './locales/de.json';
import en from './locales/en.json';

export const LANG_STORAGE_KEY = 'parklens.lang';
export const LANGUAGES = ['en', 'de'] as const;
export type Language = (typeof LANGUAGES)[number];

const detector = new LanguageDetector();
// UX §2.3: default from navigator.language — anything starting with "de" gives de, else en.
detector.addDetector({
  name: 'parklensNavigator',
  lookup: () => (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('de') ? 'de' : 'en'),
});

function syncHtmlLang(lng: string | undefined) {
  if (typeof document !== 'undefined') document.documentElement.lang = lng?.startsWith('de') ? 'de' : 'en';
}

i18n.on('languageChanged', syncHtmlLang);

void i18n
  .use(detector)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, de: { translation: de } },
    fallbackLng: 'en',
    supportedLngs: [...LANGUAGES],
    nonExplicitSupportedLngs: true,
    load: 'languageOnly',
    detection: {
      order: ['localStorage', 'parklensNavigator'],
      lookupLocalStorage: LANG_STORAGE_KEY,
      // Only an explicit choice in the switcher is persisted (see setLanguage).
      caches: [],
    },
    interpolation: { escapeValue: false },
    returnNull: false,
  });

syncHtmlLang(i18n.resolvedLanguage);

/** Language switcher: change language, persist it, keep <html lang> in sync. */
export function setLanguage(lng: Language): void {
  storage.local.set(LANG_STORAGE_KEY, lng);
  void i18n.changeLanguage(lng);
}

export function currentLanguage(): Language {
  return i18n.resolvedLanguage === 'de' ? 'de' : 'en';
}

export default i18n;
