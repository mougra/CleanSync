/**
 * Локальные (оптимистичные) отметки задач: «id задачи → новое состояние».
 *
 * Зачем общий ключ состояния, а не `ref` на странице: по отметке реагируют три
 * места сразу — строка списка, кольцо «План на сегодня» и кольцо дня в
 * календарной полосе (`WeekStrip` живёт в раскладке и о странице ничего не знает).
 * Раньше отметка была видна только в списке, а кольцо в календаре менялось после
 * перезагрузки страницы: полоса недели считала прогресс по своему ответу сервера.
 *
 * Запись снимается, когда сервер подтвердил состояние (`serverHasMark` на
 * главной): дальше на экране остаётся серверная правда.
 */
export const useTaskMarks = () => {
  const marks = useState<Record<number, boolean>>('task-marks', () => ({}));

  /** Состояние задачи с учётом локальной отметки. */
  const isMarked = (task: { id: number; is_completed: boolean }): boolean =>
    marks.value[task.id] ?? task.is_completed;

  const mark = (id: number, done: boolean) => {
    marks.value = { ...marks.value, [id]: done };
  };

  const unmark = (id: number) => {
    if (marks.value[id] === undefined) {
      return;
    }

    const rest: Record<number, boolean> = {};

    for (const [key, value] of Object.entries(marks.value)) {
      if (Number(key) !== id) {
        rest[Number(key)] = value;
      }
    }

    marks.value = rest;
  };

  return { marks, isMarked, mark, unmark };
};
