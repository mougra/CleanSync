/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Базовый адрес API. Пусто = относительные запросы `/api/...` через прокси Vite. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
