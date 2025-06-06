# MediaSoup demonstration Project

A [MediaSoup](https://mediasoup.org/ "media soup docs") WebRTC server running in Docker (which is using ubuntu image).


### Quick Start
Requirements -
* docker
    * dcoker-compose(v1)
* internet connection (ofc, to download this repo and all)
------------------

#### project structure
there is these files , which are diferent version/step involved in making this project <br> ------------src1 (bare bones)<br>------------ src2 ( uses abstractions and does the work)<br>------------src2_v2 ( has better ui explaining how does this works<br>------------ final_verison (this has rooms feature )



## Steps to get it up and running

1. Clone this repo and enter directory
```bash
    git clone <repo's-url>
    cd media_soups
```

1. 2 open Dockerfile and docker-compose file to get the gist to what they will do (it's fairly easy, note to future self) 

2. to run the project

```bash
    docker-compose up --build
```

3. Access the  appltication

Open: http://localhost:3000 <br>
SFU]:http://localhost:3000/sfu (this works for src1 , src2, src2_v2)

for final_version- <br>
http://localhost:3000/sfu/"any room name" example "http://127.0.0.1:3000/sfu/room12/" 

#### note _if it doesn't work try changing local host to (127.0.0.1) or see app.js inside the container (google how to attach shell to container) and play with "announcedIp"_




That's it! 🎉
Our mediaSoup server should be up and running 



<br>


# Development Workflow
to make changes in the code and play around
- Dockerfile uses volume mount,
    - Edit files in src1/ (or whichever version you're using) on your host machine
Changes are instantly reflected in the container
Watchify automatically rebuilds client-side files

    - No need to rebuild the container for code changes


- _now this is exciting bit:_
    - Switching Between Project Versions
    - To use src2 instead of src1:

    - Edit Dockerfile:
**dockerfileCOPY ./src2/ /test-mediasoup/**

    - Edit docker-compose.yml:
yamlvolumes:
  - ./src2:/test-mediasoup

##  Rebuild:
```bash
    docker-compose up --build
```


## Testing the Setup
1. ##### Stop and Clean Current Container
```bash
# Stop the running container
docker stop ubuntu-linux-media2

# Remove the container
docker rm ubuntu-linux-media2

# Optional: Remove the old image to force rebuild
docker rmi media-soup-server
```

2. #####  Rebuild and Run

- Build and run using docker-compose

```bash
docker-compose up --build
```

3. Verify Setup
- *Option A:* Check Automatic Startup
If successful, you should see:

    - Container building logs
npm run watch starting
npm start output
MediaSoup server starting
Access your app at http://localhost:3000

- *Option B:* Manual Verification
```bash
# Run in detached mode
docker-compose up -d --build
```


## Attach to the container shell
```bash
docker exec -it ubuntu-linux-media2 /bin/bash
```

## Inside container, check if everything is in place

```bash 
ls -la /test-mediasoup
cd /test-mediasoup
npm start
```

# Step 4: Verification, if anything goes wrong
Confirm that:

/test-mediasoup folder exists inside container
Your files (app.js, public folder, etc.) are copied correctly
npm install ran successfully
Both npm run watch and npm start work
Your MediaSoup app is accessible at http://localhost:3000/sfu

Troubleshooting
Container Issues
```bash
# Check container logs
docker logs ubuntu-linux-media2

# Check if container is running
docker ps

# Check what's inside the container
docker exec -it ubuntu-linux-media2 ls -la /test-mediasoup
```

### Common Problems

**Port conflicts**: Make sure ports 3000, 2000-2020 aren't used by other applications<br>
**Permission issues**: Ensure Docker has proper permissions<br>
**Build failures**: Check if all dependencies are available and internet connection is stable


## Rebuilding
If you need to completely rebuild:
```bash
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
```

### Multiple Instances (kaafi extra bit, not at all necessary, but markdown is fun )
To run multiple instances, change the container_name in docker-compose.
```
yml:
yamlservices:
  linux:
    container_name: "ubuntu-linux-media3"  # Change this
Development Features
```

Hot Reloading: Client-side changes automatically rebuild
Live Code Sync: Edit on host, run in container
Multiple Versions: Easy switching between src1/src2/src2_v2<br><br>
**Port Forwarding**: All necessary ports exposed
Shell Access: Direct container access for debugging


# **now v imp** (regarding limited ports)
(to use/test with more than 3-4 users, change, mediasoup transport port in dockerfile from 2020 to 2100 (as per need) )
Port Configuration

3000: Main application server
2000-2020: MediaSoup transport ports
10000-10100: Additional WebRTC ports (available but not exposed by default)


