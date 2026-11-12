# Automotive PostgreSQL data setup

This repository runs the automotive-search PostgreSQL/ParadeDB database for the
conversational-ai PoC. The automotive-search repository is pinned as a Git
submodule at `automotive-search/`; its migration, seed, and catalog-generation
scripts are built into the one-shot database tools image.

## Existing local dataset

The existing Docker volume is named `automotive_search_paradedb_data`. Compose
in this repository uses that exact volume, so it can reuse the five-million-row
dataset already generated on this machine. Docker Desktop stores its data on
D:, and the host disk guard path is also on D: by default.

Only one PostgreSQL container may use this volume at a time. Before switching
from the old automotive-search Compose stack, stop that stack without deleting
its volume:

```powershell
Set-Location D:\Projects\automotive-search-review
docker compose down
```

`docker compose down -v` deletes the database volume; do not use it when you
want to keep the dataset.

## Start the database from this repository

Initialize the pinned source checkout and copy `.env.example` to `.env` only if
you do not already have a local `.env`. The owner and application database
passwords must match the existing database roles. For a fresh setup, also set
the API token secrets and unique development-account passwords shown in the
example file. On a new machine, create the named volume once. Create the host
disk-guard directory, then start the application stack:

```powershell
git submodule update --init --recursive
Copy-Item .env.example .env
docker volume create automotive_search_paradedb_data
New-Item -ItemType Directory -Force .data\disk-guard | Out-Null
docker compose up --build -d --wait
```

The checked-out `.env` in the current local workspace was copied from the
automotive-search development setup and already contains the local database,
API, and development-account settings. It is ignored by Git.

## Generate data on a fresh volume

The existing volume already contains five million rows, so do not rerun full
generation on this machine. On a fresh setup, run the 10,000-row smoke sample
first, then review disk space before generating the full dataset:

```powershell
docker compose --profile data-generation run --rm catalog-generator node database/generators/generate-catalog.mjs --smoke
docker compose --profile data-generation run --rm catalog-generator node database/generators/generate-catalog.mjs
```

The generator checks free space on the host directory mounted at
`/host-disk-guard`. Keep `DISK_GUARD_HOST_PATH` on the same drive as Docker's
database storage. The generator refuses to proceed below its 1,500 MB minimum.

The database volume is external to this Compose project. Removing this
project's containers will not delete it; deleting the Docker volume itself will
erase the dataset.
