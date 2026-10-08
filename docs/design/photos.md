# Фотографии в интерфейсе

Все снимки скачаны с [Pexels](https://www.pexels.com) и лежат локально в `web/public/photos/`
(не хотлинкуем чужой CDN: быстрее, надёжнее и не зависит от их доступности).

Лицензия Pexels разрешает свободное использование, в том числе коммерческое, без обязательной
атрибуции. Авторов всё равно указываем — это честно и помогает, если понадобится заменить кадр.

| Файл | Где используется | Автор | Источник |
|---|---|---|---|
| `spring-cleaning.jpg` | обложка челленджа «Весенняя уборка» | cottonbro studio | [pexels.com/photo/4108775](https://www.pexels.com/photo/4108775/) |
| `autumn-home.jpg` | обложка челленджа «Осеннее обновление дома» | Matvei | [pexels.com/photo/36667793](https://www.pexels.com/photo/36667793/) |
| `laundry.jpg` | «Совет дня» на главной | Sarah Chai | [pexels.com/photo/7282367](https://www.pexels.com/photo/7282367/) |
| `kitchen-white.jpg` | резерв: кухня для чек-листов и статей | Anna Vlasova | [pexels.com/photo/34794673](https://www.pexels.com/photo/34794673/) |

## Как менять

1. Скачать кадр в ширине ~1200 px: `https://images.pexels.com/photos/<id>/pexels-photo-<id>.jpeg?auto=compress&cs=tinysrgb&w=1200`
2. Положить в `web/public/photos/`, имя — латиницей через дефис.
3. Для челленджей прописать путь в `backend/seed-challenges.ts` (`cover`) и пересоздать челлендж:
   `DELETE FROM challenges;` + `npm run seed` (сид идемпотентный по slug).
4. Обновить таблицу выше.

## Ограничения

- Скриншоты с людьми и лицами крупным планом не берём: интерфейс должен оставаться нейтральным.
- Кадр кадрируется через `object-fit: cover` (148 px в карточке, 180 px в шапке челленджа, 160 px в «Совете дня»),
  поэтому важное должно быть ближе к центру.
- Иллюстрации (SVG, нарисованы вручную — `web/app/components/IllustrationHabits.vue`) не требуют лицензий
  и предпочтительнее фото там, где нужен пустой экран.
