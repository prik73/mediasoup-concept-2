# 🛰 MediaSoup Concept Project

Alright, here’s the gist of this Dockerized MediaSoup server setup — running on Ubuntu, with wathify, Node.js, and all the usual suspects baked right in.

## 🛠 what we Need

- Docker  
- Docker Compose

## 🚀 How to Get Started (Note to Self)

### 1. Clone the Repo(blah blah blah...)

```bash
git clone https://github.com/prik73/mediasoup-concept-2.git
cd mediasoup-concept-2
2. Build the Docker Image (Dockerfile stuff) (google - how to run dockerfile)
This Dockerfile spins up an Ubuntu base, installs everything that is written in Dockerfile


2.1 docker-compose up --build

3. Fire Up the Container (docker-compose)

docker-compose up -d --build


4. Jump Inside the Container
Two ways to get a terminal inside:

VS Code: with Docker extension, right-click the container (mediasoup-server), click Attach Shell

Or CLI:


docker exec -it mediasoup-server bash
5. Run the Server
Once inside, just do:

cd test-mediasoup

npm start
And boom, the MediaSoup server is up and running on port 3000

🔁 About the Restart Policy (Yeah, this annoyed me)
The container uses restart: always in the docker-compose.yml.

Honestly, sometimes it just keeps restarting and bugs me. You can totally turn it off if you want — just tweak the compose file or run this:

docker update --restart=no mediasoup-server