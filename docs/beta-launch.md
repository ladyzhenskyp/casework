# Launching the Casework beta

A checklist for putting Casework online for invited testers. Plain steps; Railway's
menus move around a little over time, so if a button name doesn't match exactly,
look for the closest one.

## What testers get

- A link to the site. Anyone can look around and solve cases without an account.
- With an invite code, they create an account (name, email, password). Their
  progress then saves to the server and follows them to any device, and they can
  use hints and the tutor (25 replies a day each).
- A **Feedback** button in the workspace that sends you a note with the case they
  were on.

You get a private page at `/admin` with all feedback, the list of testers and how
far each has gotten, and a form to reset someone's password.

## 1. Push the latest code

In Terminal:

```
cd ~/Projects/casework
git add -A
git commit -m "Beta: accounts, feedback, admin page"
git push
```

## 2. Create the Railway service

1. In Railway, **New Project** → **Deploy from GitHub repo** → pick `casework`.
2. Railway builds it automatically. It reads `requirements.txt`, uses Python from
   `.python-version`, and starts the app from `main.py`. No start command needed.

## 3. Give it a place to keep accounts (a volume)

Accounts live in one small database file. Without a volume, it would be wiped on
every redeploy.

1. In the project, add a **Volume** and attach it to the casework service.
2. Set its **mount path** to `/data`.

## 4. Add the settings (Variables tab of the service)

| Variable | Value |
|---|---|
| `ANTHROPIC_API_KEY` | your Claude API key (paste it here, never in chat or code) |
| `CASEWORK_DB` | `/data/casework.db` |
| `CASEWORK_INVITE_CODES` | one code per tester, comma-separated, e.g. `maya-sql-beta,jon-sql-beta` |
| `CASEWORK_ADMIN_EMAILS` | the email you'll sign up with, e.g. `ladyzhenskyp@gmail.com` |

Giving each friend their own code lets you see who used which, and you can turn one
off later by removing it from the list.

## 5. Get the address and keep it awake

1. Service **Settings** → **Networking** → **Generate Domain**. That's your link.
2. Make sure **Serverless** (app sleeping) is **off**, so nobody waits on a cold start.

## 6. Check it before sending

1. Open the link, go to the workspace, **Sign in** → **Create an account** with your
   admin email and one of the codes.
2. Ask the tutor something; it should answer (not say "Sample mode").
3. Open `your-link/admin`. You should see yourself under Testers.
4. Send each friend the link and their code.

## Running it on your Mac with accounts

Add these lines to the `.env` file in the project folder (the same file as your API key):

```
CASEWORK_INVITE_CODES=local-test
CASEWORK_ADMIN_EMAILS=ladyzhenskyp@gmail.com
```

Local accounts are saved in `data/casework.db`, which git ignores.

## If a tester forgets their password

Open `/admin`, type their email and a new temporary password, press **Reset**, and
send it to them. It signs them out everywhere; their progress is kept.
