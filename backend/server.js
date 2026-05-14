import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import authRoutes from './routes/auth.js'
import schedulesRoutes from './routes/schedules.js'
import tasksRoutes from './routes/tasks.js'
import pool from './db.js'

dotenv.config()

const app = express()

const ensureDatabaseSchema = async () => {
  const queries = [
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(255);`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_email_confirmed BOOLEAN DEFAULT FALSE;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS email_confirm_token VARCHAR(255);`,
  ]

  for (const query of queries) {
    try {
      await pool.query(query)
    } catch (err) {
      console.error('Schema migration failed:', err)
    }
  }
}

// Middleware
app.use(cors())
app.use(express.json())

// Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'Backend is running' })
})

app.use('/api/auth', authRoutes)
app.use('/api/schedules', schedulesRoutes)
app.use('/api/tasks', tasksRoutes)

const PORT = process.env.PORT || 5000

ensureDatabaseSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`)
    })
  })
  .catch((err) => {
    console.error('Failed to ensure database schema', err)
    process.exit(1)
  })
