# 🛰️ MediaSoup Docker Project

A **MediaSoup WebRTC** server running inside a Docker container using an Ubuntu base image.

---

## 🚀 Quick Start

### 📦 Requirements

- **Docker**
- **Docker Compose** (specifically **v1**)
- **Internet Connection**

---

## 📁 Project Structure
media_soups/
├── Dockerfile
├── docker-compose.yml
├── src1/ # Initial version
├── src2/ # Second iteration
├── src2_v2/ # Includes explanations and minimal documentation
└── final_version/ # Final version with dynamic room support


what we need: 
Docker
Docker Compose (specifically docker-compose v1)
Internet connection, obv

Steps

Clone this repo and enter directory
bashgit clone <repo's-url>
cd media_soups

Run the project
bashdocker-compose up --build

Access the  app

Open: http://localhost:3000 
SFU: http://localhost:3000/sfu (this works for src1 , src2, src2_v2)

for final_version
SFU: http://localhost:3000/sfu/"any room name" example "http://127.0.0.1:3000/sfu/room12/" 

    if it doesn't work try changing local host to (127.0.0.1) or see app.js inside the container (google how to attach shell to container) and play with "announcedIp"




That's it! 🎉
Our mediaSoup server should be up and running

Development Workflow
Making Code Changes
-Dockerfile uses volume mount,

Edit files in src1/ (or whichever version you're using) on your host machine
Changes are instantly reflected in the container
Watchify automatically rebuilds client-side files
No need to rebuild the container for code changes


now this is exciting bit: 
Switching Between Project Versions
To use src2 instead of src1:

Edit Dockerfile:
dockerfileCOPY ./src2/ /test-mediasoup/

Edit docker-compose.yml:
yamlvolumes:
  - ./src2:/test-mediasoup

Rebuild:
bashdocker-compose up --build


Testing Your Setup
Step 1: Stop and Clean Current Container
bash# Stop the running container
docker stop ubuntu-linux-media2

# Remove the container
docker rm ubuntu-linux-media2

# Optional: Remove the old image to force rebuild
docker rmi media-soup-server
Step 2: Rebuild and Run

# Build and run using docker-compose
docker-compose up --build
Step 3: Verify Setup
Option A: Check Automatic Startup
If successful, you should see:

Container building logs
npm run watch starting
npm start output
MediaSoup server starting
Access your app at http://localhost:3000

Option B: Manual Verification
bash# Run in detached mode
docker-compose up -d --build

# Attach to the container shell
docker exec -it ubuntu-linux-media2 /bin/bash

# Inside container, check if everything is in place
ls -la /test-mediasoup
cd /test-mediasoup
npm start
Step 4: Verification Checklist
Confirm that:

/test-mediasoup folder exists inside container
Your files (app.js, public folder, etc.) are copied correctly
npm install ran successfully
Both npm run watch and npm start work
Your MediaSoup app is accessible at http://localhost:3000/sfu

Troubleshooting
Container Issues
bash# Check container logs
docker logs ubuntu-linux-media2

# Check if container is running
docker ps

# Check what's inside the container
docker exec -it ubuntu-linux-media2 ls -la /test-mediasoup
Common Problems

Port conflicts: Make sure ports 3000, 2000-2020 aren't used by other applications
Permission issues: Ensure Docker has proper permissions
Build failures: Check if all dependencies are available and internet connection is stable

Rebuilding
If you need to completely rebuild:
bash# Stop and remove everything
docker-compose down
docker system prune -f

# Rebuild from scratch
docker-compose up --build
Advanced Usage
Background Mode
bash# Run container in background
docker-compose up -d --build

# View logs
docker logs -f ubuntu-linux-media2

# Stop background container
docker-compose down
Multiple Instances
To run multiple instances, change the container_name in docker-compose.yml:
yamlservices:
  linux:
    container_name: "ubuntu-linux-media3"  # Change this
Development Features

Hot Reloading: Client-side changes automatically rebuild
Live Code Sync: Edit on host, run in container
Multiple Versions: Easy switching between src1/src2/src2_v2
Port Forwarding: All necessary ports exposed
Shell Access: Direct container access for debugging


now v imp 
(to use/test with more than 3-4 users, change, mediasoup transport port in dockerfile from 2020 to 2100 (as per need) )
Port Configuration

3000: Main application server
2000-2020: MediaSoup transport ports
10000-10100: Additional WebRTC ports (available but not exposed by default)


