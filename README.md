<p align="center"><img src="assets/icon.png" width="96" alt="HydraDB" /></p>

# n8n-nodes-hydradb

An [n8n](https://n8n.io) community node for [HydraDB](https://hydradb.com):
ingest knowledge and recall context from your workflows. The node is
dependency-free and uses n8n's built-in HTTP helper.

## Operations

| Operation | What it does |
|-----------|--------------|
| Ingest    | Store a note as knowledge (`text` + optional `title`). |
| Query     | Recall relevant context for a query; returns one item per chunk, with the stored text, score, title, and id. |

## Credentials

The `HydraDB API` credential holds:

- **API Key** (required) - sent as a Bearer token.
- **Database** (required) - the database (tenant) to read and write.
- **Collection** (optional) - a sub-tenant scope.
- **Base URL** (optional) - defaults to `https://api.hydradb.com`.

The connection is verified against `GET /databases`.

## Build and load locally

```bash
npm install
npm run build        # outputs dist/
```

Link the package into n8n's custom directory and restart:

```bash
mkdir -p ~/.n8n/custom
ln -s "$(pwd)" ~/.n8n/custom/n8n-nodes-hydradb
```

The HydraDB node then appears in the node panel.

## Usage

Add the node, pick an operation, and select your HydraDB credential. Ingest
writes a note; Query returns matching context that downstream nodes can read.
