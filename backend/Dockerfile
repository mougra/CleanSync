FROM node:20-slim

WORKDIR /app

# Install all dependencies including devDependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the code
COPY . .

# Expose server port
EXPOSE 5000

# Start server in dev mode for hot-reload
CMD ["npm", "run", "dev"]
