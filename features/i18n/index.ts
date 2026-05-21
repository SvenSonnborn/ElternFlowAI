import { getLocales } from "expo-localization";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import de from "./locales/de.json";
import en from "./locales/en.json";

export const resources = {
  de: { translation: de },
  en: { translation: en },
} as const;

export type SupportedLanguage = keyof typeof resources;
export const defaultLanguage: SupportedLanguage = "de";

const detectDeviceLanguage = (): SupportedLanguage => {
  const locale = getLocales()[0]?.languageCode?.toLowerCase();
  return locale === "en" ? "en" : defaultLanguage;
};

/* eslint-disable import/no-named-as-default-member */
if (!i18n.isInitialized) {
  i18n.use(initReactI18next);
  void i18n.init({
    resources,
    lng: detectDeviceLanguage(),
    fallbackLng: defaultLanguage,
    interpolation: { escapeValue: false },
    compatibilityJSON: "v4",
  });
}
/* eslint-enable import/no-named-as-default-member */

export default i18n;
