# MC Hammer

A local web portal for managing Minecraft servers running in Docker Compose.

## Requirements

- Go 1.22+
- Docker and Docker Compose installed locally

### Install dependencies on ubuntu

```
# Go
https://go.dev/doc/install


# Docker

https://docs.docker.com/engine/install/debian/

# Install docker
sudo apt install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Check if running
sudo systemctl status docker

```

## Run

1. Start the portal:

```bash
cd /Users/johan/Documents/repos/mc-hammer
go run ./cmd/portal
```

2. Open `http://localhost:8080`

## Usage

- Create a new server by name and port.
- View server details and delete the server when no longer needed.
- The frontend is built using Tabler from https://github.com/tabler/tabler.

## How it works

- Each server is created in `./servers/<id>` with a `docker-compose.yml` and `data/` volume directory.
- The backend uses `docker compose up -d` and `docker compose down -v` to manage container lifecycles.
