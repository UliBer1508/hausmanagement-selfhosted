# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/0a55b3b7-98cb-4fe5-aff9-419ea27d0cf7

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/0a55b3b7-98cb-4fe5-aff9-419ea27d0cf7) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## Environment Variables

Dieses Projekt nutzt **keine `.env`-Datei**. Alle Environment-Variablen werden
von Lovable Cloud automatisch zur Build-Zeit injiziert. Für lokale
Entwicklung außerhalb von Lovable müssten folgende Variablen gesetzt sein
(verwendet via `import.meta.env.*`):

| Variable | Zweck |
|---|---|
| `VITE_SUPABASE_URL` | Supabase Project URL (publishable) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase Anon Key (publishable) |
| `VITE_SUPABASE_PROJECT_ID` | Supabase Project ID |

> Server-seitige Secrets (z. B. `GOOGLE_GEMINI_API_KEY`, `RESEND_API_KEY`)
> werden ausschließlich in **Edge Functions** verwendet und über die
> Lovable-Cloud Secrets verwaltet — niemals im Client-Code.

## Package Manager

Dieses Projekt nutzt **Bun** (siehe `bun.lock` und `packageManager`-Feld in
`package.json`). Bitte `bun install` statt `npm install` verwenden.

## Tests

```sh
bunx vitest run
```

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/0a55b3b7-98cb-4fe5-aff9-419ea27d0cf7) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)
