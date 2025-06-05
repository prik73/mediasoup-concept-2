FROM ubuntu 

# Installing dependencies for ubuntu image
RUN apt-get update && \
    apt-get install -y build-essential python3-pip net-tools iputils-ping iproute2 curl

# For nodejs's installation
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
RUN apt-get install -y nodejs

# Watchify installation
RUN npm install -g watchify

# Create the test-mediasoup directory (matching your manual setup)
RUN mkdir -p /test-mediasoup

# Set working directory to match your container setup
WORKDIR /test-mediasoup

# Copy the source code (change src1 to src2/src2_v2 as needed)
COPY ./src1/ /test-mediasoup/

# Install dependencies
RUN npm install

# Expose ports
EXPOSE 3000
EXPOSE 2000-2020
EXPOSE 10000-10100

# # Default command
# CMD ["npm", "start"]