# Kubernetes deployment

ParkLens on the `k8s-baseline` EKS cluster (eu-central-1, arm64 nodes) at **https://parklens.dora.cust.sobr-brews.ch**.
Platform rules: `k8s-boilerplate/docs/deploying-apps.md`.

| File | What |
|---|---|
| `kustomization.yaml` | Entry point: namespace, image tags, ConfigMap generator |
| `config.env` | Non-secret API settings (becomes the `parklens-config` ConfigMap) |
| `db.yaml` | PostgreSQL 17 StatefulSet with a 10 GiB gp3 volume, Service `db` |
| `api.yaml` | API Deployment (1 replica) and Service `api` |
| `web.yaml` | nginx Deployment (2 replicas), Service `web`, PodDisruptionBudget |
| `ingress.yaml` | Host rule on the shared ALB; TLS and DNS are handled by the platform |

Images come from GHCR (`.github/workflows/docker.yml`) and are multi-arch. Only `sha-<commit>` tags are used,
never `latest`.

## First deployment

```sh
export AWS_PROFILE=dora-platform
kubectl config use-context dora-platform

kubectl apply -f k8s/namespace.yaml

# Secret values are generated here and never committed. `create` refuses to overwrite an existing secret.
kubectl -n parklens create secret generic parklens-env \
  --from-literal=POSTGRES_PASSWORD="$(openssl rand -hex 24)" \
  --from-literal=JWT_SECRET="$(openssl rand -hex 32)" \
  --from-literal=GATE_API_KEY="$(openssl rand -hex 24)" \
  --from-literal=ADMIN_PASSWORD="$(openssl rand -base64 18)"

kubectl apply --dry-run=server -k k8s/
kubectl apply -k k8s/
kubectl -n parklens rollout status statefulset/db deployment/api deployment/web --timeout=5m
```

Log in as `admin@parklens.local` (`ADMIN_EMAIL` in `config.env`) with the generated password:

```sh
kubectl -n parklens get secret parklens-env -o jsonpath='{.data.ADMIN_PASSWORD}' | base64 -d; echo
kubectl -n parklens get secret parklens-env -o jsonpath='{.data.GATE_API_KEY}' | base64 -d; echo   # for the camera
```

The first Ingress in the cluster creates the shared ALB (2–3 minutes); the DNS record follows 1–2 minutes later:

```sh
kubectl -n parklens describe ingress parklens      # events must not show warnings
dig +short parklens.dora.cust.sobr-brews.ch @$(dig +short NS dora.cust.sobr-brews.ch | head -1)
curl -sS https://parklens.dora.cust.sobr-brews.ch/api/health
```

## Updates

Set both image tags in `kustomization.yaml` to the new `sha-<commit>` (the Docker images workflow must have
finished for that commit), then check the context and apply:

```sh
kubectl config current-context        # dora-platform
kubectl apply --dry-run=server -k k8s/ && kubectl apply -k k8s/
```

Changing `config.env` rolls the API automatically. After changing the Secret, restart the API:
`kubectl -n parklens rollout restart deployment/api`.

## Things to know

- **The API runs as a single replica.** Live updates use an in-process event bus, so a second API pod's clients
  would miss events. The web tier scales freely.
- **`POSTGRES_PASSWORD` only takes effect when the database is first created.** To change it, run
  `ALTER USER parklens PASSWORD '…'` in the database first, then update the Secret and restart the API.
- **`ADMIN_PASSWORD` only seeds the first admin.** Later password changes happen in the UI.
- **The database volume is deleted with its claim** (gp3 reclaim policy `Delete`). Deleting the namespace, or
  running `kubectl delete -k k8s/`, destroys all data. There are no automatic backups. Take EBS snapshots or run
  `pg_dump` (`kubectl -n parklens exec db-0 -- pg_dump -U parklens parklens > backup.sql`) before risky changes.
- **Rate limits need the real client IP.** `TRUST_PROXY_HOPS=2` tells the API that the ALB and nginx sit in front
  of it. Without it, every visitor shares the ALB's IP and therefore one login rate limit.
