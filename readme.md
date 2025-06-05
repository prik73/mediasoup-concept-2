# mediasoup docker project

this is a basic but deep implementation of mediasoup. it utilizes **node.js**, **docker**, and **mediasoup** to establish a media server featuring hot-reloading capability through `watchify`.



## what this project uses

it uses docker to create an ubuntu image, and inside it, our project will run. the project uses mediasoup (using node.js, obviously), docker-compose for making the container.





## requirements to run

-> a working laptop running linux or wsl (mac will be fine too, i dunno). 
->docker,
->dockercompose, and just this.
->and internet (to clone this repo).


## how to run

clone the repo, go into the folder, and run "docker-compose up --build"

this command will:
- build the image
- mount the `src/` folder
-- or src2/ (manualy change in the Dockerfile), to use more abstract version



after running

your mediasoup server should be accessible on:

http://localhost:3000/sfu

ports 2000–2020 are also exposed for media transport.


if you modify code and need to rebuild the container, run:
```bash
docker-compose up --build
```

if you wish to create a new container instance, adjust the `container_name` in your `docker-compose.yml` file.

---

-done!

we are now set to work on or experiment with the project within the docker environment.


# 🎥 MediaSoup Docker Project

A comprehensive MediaSoup implementation inside a Dockerized Ubuntu environment with **hot-reloading** via Watchify. Perfect for real-time WebRTC development with multiple project versions and fast iteration.

---

## 🛠 What This Project Uses

- **Docker**: Isolated Ubuntu development environment  
- **MediaSoup**: Node.js-based WebRTC SFU  
- **Docker Compose**: Multi-container orchestration  
- **Watchify**: Hot-reloads client-side JS on changes  
- **Node.js**: JavaScript runtime for server/client  

---

## 📁 Project Structure

media_soups/
├── Dockerfile # Container build instructions
├── docker-compose.yml # Container configuration
├── src1/ # Project version 1
├── src2/ # Project version 2
├── src2_v2/ # Project version 2.2
├── final_something/ # Final version
├── package.json
└── README.md

yaml
Copy
Edit

---

## ✅ Requirements

- Linux / macOS / WSL-enabled system  
- [Docker](https://docs.docker.com/get-docker/)  
- [Docker Compose](https://docs.docker.com/compose/)  
- Internet connection

---

## 🚀 How to Run

### Initial Setup

```bash
git clone <your-repo-url>
cd media_soups
docker-compose up --build
🌐 Accessing Your Application
Main App: http://localhost:3000

SFU Endpoint: http://localhost:3000/sfu

Media Ports: 2000–2020 (WebRTC)

🔁 Development Workflow
Making Code Changes
Edit files in src1/ (or any version you're using)

Changes auto-reflect inside the container

Watchify rebuilds client-side code

No need to rebuild the container

🔄 Switching Between Project Versions
Example: Use src2 instead of src1
In Dockerfile:

dockerfile
Copy
Edit
COPY ./src2/ /test-mediasoup/
In docker-compose.yml:

yaml
Copy
Edit
volumes:
  - ./src2:/test-mediasoup
Then Rebuild:

bash
Copy
Edit
docker-compose up --build
🧪 Testing Your Setup
Step 1: Stop and Clean Container
bash
Copy
Edit
docker stop ubuntu-linux-media2
docker rm ubuntu-linux-media2
docker rmi media-soup-server   # optional
Step 2: Rebuild and Run
bash
Copy
Edit
cd ~/Desktop/project/concepts/media_soups
docker-compose up --build
Step 3: Verify Setup
Option A: Automatic
Container logs show startup

npm run watch and npm start outputs appear

Access app at http://localhost:3000

Option B: Manual
bash
Copy
Edit
docker-compose up -d --build
docker exec -it ubuntu-linux-media2 /bin/bash
cd /test-mediasoup
npm start
✅ Verification Checklist
/test-mediasoup exists in container

Project files copied correctly

npm install ran successfully

Both npm run watch and npm start run

App available at http://localhost:3000

🐛 Troubleshooting
Container Issues
bash
Copy
Edit
docker logs ubuntu-linux-media2
docker ps
docker exec -it ubuntu-linux-media2 ls -la /test-mediasoup
Common Problems
Port conflicts: Check ports 3000, 2000–2020

Permissions: Docker needs proper access

Build fails: Ensure dependencies and internet

🔁 Rebuilding Everything
bash
Copy
Edit
docker-compose down
docker system prune -f
docker-compose up --build
⚙️ Advanced Usage
Background Mode
bash
Copy
Edit
docker-compose up -d --build
docker logs -f ubuntu-linux-media2
docker-compose down
Multiple Instances
Edit docker-compose.yml:

yaml
Copy
Edit
services:
  linux:
    container_name: "ubuntu-linux-media3"