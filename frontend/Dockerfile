FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json tsconfig*.json vite.config.ts postcss.config.js tailwind.config.js index.html ./
RUN npm install
COPY src ./src
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 5173
CMD ["nginx", "-g", "daemon off;"]
