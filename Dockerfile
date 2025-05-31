FROM ubuntu 

#installing dependencies for ubuntu image
RUN apt-get update && \
    apt-get install -y build-essential python3-pip net-tools iputils-ping iproute2 curl

#for nodejs's installation
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
RUN apt-get install -y nodejs

#watchify(does kindoff same work as vite)
RUN npm install -g watchify

#setting working directory inside container
WORKDIR ./usr/src/app

COPY ./src1 ./

#cause obv, we'll have to install the dependencies
RUN npm install

#ports and all opening
EXPOSE 3000
EXPOSE 2000-2020
EXPOSE 10000-10100

CMD ["npm", "start"]
