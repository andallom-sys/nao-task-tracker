# NAO Medical Task Tracker

This is a lightweight kanban-style task tracker built for `Vercel + Supabase`.

## What it includes

- Drag-and-drop task movement across `Pending`, `Needs Attention`, and `Done`
- Task fields for title, assignee, description, note, status, due date, and attached link
- Search across task content
- Shared task storage through Supabase
- Live updates through Supabase Realtime
- Assignee-based color coding on task cards
- Spreadsheet-inspired NAO styling with `Adamina` headers and `Commissioner` body text
- Responsive layout for desktop and mobile

## Files

- `index.html`
- `styles.css`
- `app.js`
- `config.js`
- `config.example.js`
- `supabase-schema.sql`

## Setup

1. Create a new Supabase project.
2. In the Supabase SQL editor, run [supabase-schema.sql](C:\Users\Margen\OneDrive\Documents\Nao Medical Operations\nao-task-dashboard\supabase-schema.sql).
3. In Supabase project settings, copy the project URL and anon key.
4. Replace the placeholders in [config.js](C:\Users\Margen\OneDrive\Documents\Nao Medical Operations\nao-task-dashboard\config.js) with your real values.
5. Open [index.html](C:\Users\Margen\OneDrive\Documents\Nao Medical Operations\nao-task-dashboard\index.html) or deploy to Vercel and confirm the status pill shows `Shared board connected`.

## Publish online

The app is static, so it can be deployed directly to Vercel.

Suggested flow:

1. Put this folder in a GitHub repository.
2. Import the repo into Vercel.
3. Deploy it as a static site.
4. In Vercel, add `tasks.naomedical.com` as a custom domain.
5. In your DNS provider, point `tasks.naomedical.com` to Vercel with the record Vercel asks for.

## Important note about data

This version is shared across users because it reads and writes to Supabase.

The current security model is intentionally simple: anyone who can access the site can read and modify tasks. If you want, the next step after launch can be adding Supabase Auth so only approved NAO Medical users can edit the board.
