/**
 * Одноразовое приглашение для гостя.
 *
 * Состояние живёт в общем `useState`, потому что приглашение показывается в двух
 * местах: карточкой в боковом меню на десктопе и плашкой в потоке страницы на
 * телефоне (боковое меню там скрыто). Логика видимости и запоминания закрытия
 * должна быть одна, иначе два экземпляра разойдутся.
 *
 * Показываем один раз за всё время: закрытие запоминается в localStorage.
 * Проверка идёт только на клиенте — на сервере localStorage нет, а рисовать
 * баннер в SSR нельзя: разметка сервера и клиента разошлась бы при гидрации.
 */
const STORAGE_KEY = 'tidyplan-guest-invite-dismissed';

/** Где приглашение не нужно: там гость и так занят входом или регистрацией. */
const HIDDEN_ROUTES = ['/login', '/register', '/confirm-email', '/reset-password', '/forgot-password'];

export const useGuestInvite = () => {
  const auth = useAuthStore();
  const route = useRoute();

  const visible = useState('guest-invite:visible', () => false);
  const ready = useState('guest-invite:ready', () => false);

  onMounted(() => {
    // Композабл вызывается из двух компонентов: инициализируемся один раз
    if (ready.value) {
      return;
    }

    ready.value = true;

    const onAuthPage = HIDDEN_ROUTES.some((path) => route.path.startsWith(path));

    visible.value = !onAuthPage && !localStorage.getItem(STORAGE_KEY);
  });

  const dismiss = () => {
    visible.value = false;

    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // Приватный режим: приглашение вернётся в следующий раз — это не беда
    }
  };

  /** Показываем только гостю и только пока он не закрыл приглашение. */
  const shown = computed(() => visible.value && !auth.isAuthenticated);

  return { shown, dismiss };
};
