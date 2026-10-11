/**
 * Шторка «Добавить задачу»: одна на всё приложение.
 *
 * Лист живёт в `AppFab` (он есть в раскладке на любой странице), а открыть его
 * нужно из разных мест — круглая кнопка в углу и «+» в пустом плане дня.
 * Поэтому состояние открытия вынесено в общий `useState`, а не дублируется
 * локальными `ref` в каждом компоненте: иначе на экране оказалось бы две
 * одинаковых шторки.
 */
export const useTaskSheet = () => {
  const auth = useAuthStore();
  const localePath = useLocalePath();

  const open = useState<boolean>('task-create-sheet', () => false);

  /** Открыть лист: гостя отправляем на вход — форма ему недоступна. */
  const openSheet = async () => {
    if (!auth.isAuthenticated) {
      await navigateTo(localePath('/login'));
      return;
    }

    open.value = true;
  };

  const closeSheet = () => {
    open.value = false;
  };

  return { open, openSheet, closeSheet };
};
