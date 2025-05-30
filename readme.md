# 🛰 MediaSoup Concept Project

This is a Dockerized MediaSoup server project. The container is based on Ubuntu and includes everything needed: Fortify, Node.js, and all project dependencies.

## 🛠 Requirements

- Docker
- Docker Compose

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/prik73/mediasoup-concept-2.git
cd mediasoup-concept-2
```

### 2. Start the Container

```bash
docker-compose up -d --build
```

This builds the image and starts the container. Necessary ports are exposed (`3000`, `2000–2020`, `10000–10100`).

### 3. Access the Container

You can either:

- Use VS Code (with the Docker extension) → right-click the container → Attach Shell  
- Or use CLI:

```bash
docker exec -it mediasoup-server bash
```

### 4. Run the Server

Inside the container shell:

```bash
npm start
```

## 🔁 Restart Policy

The container uses `restart: always` in `docker-compose.yml`.  
You may turn it off if it annoys you (I may turn it off — note to self).