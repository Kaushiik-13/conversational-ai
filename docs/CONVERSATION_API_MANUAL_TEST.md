# Conversation API — manual smoke test

This checks the first API slice only. It accepts Cube Query JSON; it does not
accept natural-language questions yet.

## Start the app

1. Start Docker Desktop and wait until its engine is ready.
2. From the repository root, run:

   ```powershell
   docker compose up --build -d --wait
   ```

3. Open `http://localhost:4200` and sign in with an existing development
   account. The local `.env` file holds the development passwords.

## Run an allowed query

While signed in, open the browser developer console on `http://localhost:4200`
and run:

```js
fetch('/api/v1/conversation/query', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    version: 1,
    model: 'automotive_catalog',
    measures: ['part_count'],
    dimensions: ['commodity'],
    filters: [],
    limit: 10,
  }),
})
  .then(async (response) => ({ status: response.status, body: await response.json() }))
  .then(console.log);
```

Expected: HTTP `200`, a `data.query` matching the accepted request, and up to
10 `data.rows` containing `commodity` and `part_count`. Counts reflect only
the active organization's rows and permissions.

## Check rejection and organization isolation

- Change `dimensions` to `['cost_usd']`. Expected: HTTP `400` with
  `INVALID_CUBE_QUERY`.
- Add `organizationId: '...'` to the query object. Expected: HTTP `400` because
  identity and organization selection are not Cube Query fields.
- If the signed-in user belongs to multiple organizations, switch the active
  organization in the app and repeat the allowed query. Results must follow
  the selected organization; the request body cannot select a different one.

To stop the containers while keeping the database volume, run
`docker compose down`. Do not use `docker compose down -v` if you want to keep
the existing automotive dataset.
