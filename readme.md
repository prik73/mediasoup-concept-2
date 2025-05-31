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



after running

your mediasoup server should be accessible on:

http://localhost:3000

ports 2000–2020 are also exposed for media transport.


if you modify code and need to rebuild the container, run:
```bash
docker-compose up --build
```

if you wish to create a new container instance, adjust the `container_name` in your `docker-compose.yml` file.

---

-done!

we are now set to work on or experiment with the project within the docker environment.
