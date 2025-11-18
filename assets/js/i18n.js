/* =======================================================
   Vis Lokaties — i18n.js
   Eenvoudige vertaalmodule met globale events
   Versie: 0.0.0
   ======================================================= */

let currentLang = "nl";
let dictionary = {};

export function setDictionary(lang, dict) {
  currentLang = lang;
  dictionary = dict || {};
  document.documentElement.lang = lang;
  document.dispatchEvent(
    new CustomEvent("vislok:language", { detail: { lang, dictionary } })
  );
}

export function t(key, fallback = "") {
  if (!key) return fallback;
  return dictionary[key] ?? fallback ?? key;
}

export function getLanguage() {
  return currentLang;
}

export function getDictionary() {
  return dictionary;
}

window.VisLokI18n = {
  setDictionary,
  t,
  getLanguage,
  getDictionary
};
