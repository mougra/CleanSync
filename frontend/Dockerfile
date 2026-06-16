FROM node:20-slim

WORKDIR /app

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости
RUN npm install --legacy-peer-deps

# Копируем код приложения
COPY . .

# Expose port
EXPOSE 5173

# Запуск приложения
CMD ["npm", "run", "dev", "--", "--host"]
