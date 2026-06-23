# Shop Admin

## Login file

Create `admin/auth/users.json` from `admin/auth/users.example.json`.

Generate a password hash:

```powershell
npm.cmd --prefix admin run hash-password -- your-password
```

Put the generated `scrypt$...$...` value into `users.json`:

```json
{
  "users": [
    {
      "username": "admin",
      "passwordHash": "scrypt$..."
    }
  ]
}
```

Do not put the `scrypt$...$...` password hash into `.env`. Docker Compose treats `$...`
as environment variable syntax and will print warnings like `variable is not set`.

`ADMIN_SESSION_SECRET` in `.env` is optional, but in production it should be a plain random
string without `$` characters.

For SSH-tunnel access through `http://127.0.0.1:<port>`, keep:

```env
ADMIN_COOKIE_SECURE=false
```

Use `ADMIN_COOKIE_SECURE=true` only if the admin panel is opened directly through HTTPS.
