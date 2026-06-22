-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  username VARCHAR(255),
  avatar_url TEXT,
  is_email_confirmed BOOLEAN DEFAULT FALSE,
  email_confirm_token VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create refresh tokens table
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  token TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create password reset tokens table
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  token VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create schedules table (for each user's cleaning schedule)
CREATE TABLE IF NOT EXISTS schedules (
  id SERIAL PRIMARY KEY,
  user_id INT,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  is_template BOOLEAN DEFAULT FALSE,
  is_seasonal BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  schedule_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  frequency VARCHAR(50), -- daily, weekly, monthly, etc.
  day_of_week INT, -- 0-6 (Sunday-Saturday)
  day_of_month INT, -- 1-31
  due_date DATE,
  time TIME, -- time when task is scheduled
  estimated_minutes INT DEFAULT 0,
  room VARCHAR(255),
  is_completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE
);

-- Create task checklists table
CREATE TABLE IF NOT EXISTS task_checklists (
  id SERIAL PRIMARY KEY,
  task_id INT NOT NULL,
  item TEXT NOT NULL,
  is_completed BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX idx_checklists_task_id ON task_checklists(task_id);

-- Create indexes for faster queries
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_schedules_user_id ON schedules(user_id);
CREATE INDEX idx_tasks_schedule_id ON tasks(schedule_id);
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);

-- Create achievements definitions table
CREATE TABLE IF NOT EXISTS achievements (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  icon VARCHAR(100),
  criteria_type VARCHAR(50) NOT NULL,
  criteria_value INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create user-earned achievements mapping table
CREATE TABLE IF NOT EXISTS user_achievements (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  achievement_id INT NOT NULL,
  earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (achievement_id) REFERENCES achievements(id) ON DELETE CASCADE,
  UNIQUE(user_id, achievement_id)
);

-- Seed data for achievements
INSERT INTO achievements (code, name, description, icon, criteria_type, criteria_value)
VALUES
('first_step', 'First Step', 'Complete your first cleaning task!', 'pi-check-circle', 'total_completed', 1),
('dedicated', 'Dedicated', 'Complete 10 cleaning tasks!', 'pi-star', 'total_completed', 10),
('pro_cleaner', 'Pro Cleaner', 'Complete 50 cleaning tasks!', 'pi-trophy', 'total_completed', 50)
ON CONFLICT (code) DO NOTHING;
