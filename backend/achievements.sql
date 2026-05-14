-- Insert achievements data
INSERT INTO achievements (key, title, description, icon, category, condition_type, condition_value, points) VALUES
-- Beginner achievements (1-10)
('first_task', 'Новый старт', 'Выполните свою первую задачу по уборке', '🎯', 'beginner', 'tasks_completed', 1, 10),
('first_checklist', 'Чек-лист завершен', 'Завершите один чек-лист целиком', '✅', 'beginner', 'checklists_completed', 1, 15),
('five_tasks', 'Первые шаги', 'Выполните 5 задач по уборке', '👟', 'beginner', 'tasks_completed', 5, 20),
('week_streak', 'Недельная привычка', 'Поддерживайте чистоту 7 дней подряд', '🔥', 'beginner', 'streak_days', 7, 25),
('ten_tasks', 'Десятка', 'Выполните 10 задач по уборке', '💪', 'beginner', 'tasks_completed', 10, 30),

-- Intermediate achievements (11-20)
('two_week_streak', 'Две недели подряд', 'Поддерживайте чистоту 14 дней подряд', '⚡', 'intermediate', 'streak_days', 14, 40),
('twenty_tasks', 'Двадцатка', 'Выполните 20 задач по уборке', '🎖️', 'intermediate', 'tasks_completed', 20, 50),
('three_checklists', 'Мастер чек-листов', 'Завершите 3 чек-листа', '📋', 'intermediate', 'checklists_completed', 3, 45),
('month_streak', 'Месячная привычка', 'Поддерживайте чистоту 30 дней подряд', '🌟', 'intermediate', 'streak_days', 30, 60),
('fifty_tasks', 'Полтинник', 'Выполните 50 задач по уборке', '🏆', 'intermediate', 'tasks_completed', 50, 75),

-- Advanced achievements (21-27)
('perfect_week', 'Идеальная неделя', 'Завершите все задачи за неделю', '👑', 'advanced', 'perfect_week', 1, 100),
('hundred_tasks', 'Столетие', 'Выполните 100 задач по уборке', '💯', 'advanced', 'tasks_completed', 100, 150),
('six_month_streak', 'Полгода чистоты', 'Поддерживайте чистоту 180 дней подряд', '🎊', 'advanced', 'streak_days', 180, 200),
('ten_checklists', 'Чек-лист мастер', 'Завершите 10 чек-листов', '📊', 'advanced', 'checklists_completed', 10, 120),
('year_streak', 'Год чистоты', 'Поддерживайте чистоту 365 дней подряд', '🎆', 'advanced', 'streak_days', 365, 300),
('five_hundred_tasks', 'Легенда', 'Выполните 500 задач по уборке', '🌟', 'advanced', 'tasks_completed', 500, 250),
('master_cleaner', 'Мастер чистоты', 'Достигните всех предыдущих достижений', '👑', 'advanced', 'all_achievements', 1, 500);