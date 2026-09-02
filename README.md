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

## Run as a service (Debian/Ubuntu)

To keep the portal running across crashes and reboots, install it as a systemd
service. From a checkout on the server:

```bash
sudo ./deploy/install.sh
```

That builds a binary, installs it to `/opt/mc-hammer` along with `web/`, and
enables `deploy/mc-hammer.service` at boot. Re-run the script to deploy a new
build; it never touches the contents of `servers/`.

Defaults can be overridden (keep `sudo -E` so the variables survive):

```bash
MC_HAMMER_DIR=/srv/mc-hammer MC_HAMMER_PORT=9000 sudo -E ./deploy/install.sh
```

Day to day:

```bash
systemctl status mc-hammer
journalctl -u mc-hammer -f
systemctl restart mc-hammer
```

The listen port lives in `/etc/default/mc-hammer` — edit it and restart. To
remove the service: `sudo systemctl disable --now mc-hammer && sudo rm /etc/systemd/system/mc-hammer.service`.

The Minecraft servers themselves need nothing extra: their generated compose
files use `restart: unless-stopped`, so Docker brings them back after a reboot
on its own.

Three things worth knowing:

- The service runs as **root**. That is deliberate: the Minecraft containers
  write their world data as uid 1000, so a lesser user gets `permission denied`
  when deleting a server, and port 80 needs the privilege anyway. Do not add
  `CapabilityBoundingSet=` to the unit — trimming root's capabilities drops
  `CAP_DAC_OVERRIDE` and brings the delete failure straight back.
- Because it is root and drives the Docker socket, don't expose the portal to
  the open internet — keep it behind a firewall, a VPN, or an authenticating
  reverse proxy.
- The portal resolves `./servers` and `web/static` relative to its working
  directory, which is why the unit sets `WorkingDirectory`.

## Usage

- Create a new server by name and port.
- View server details and delete the server when no longer needed.
- The frontend is built using Tabler from https://github.com/tabler/tabler.

## How it works

- Each server is created in `./servers/<id>` with a `docker-compose.yml` and `data/` volume directory.
- The backend uses `docker compose up -d` and `docker compose down -v` to manage container lifecycles.
