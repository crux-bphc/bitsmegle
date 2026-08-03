# BITSmegle

A real-time video chat platform that connects BITS Pilani students randomly for conversations, built with SvelteKit, Express.js and WebRTC.

## Quick Setup Guide

### Prerequisites

- Node.js 18+
- MongoDB — either Atlas, or the local Docker instance described below
- Docker with the Compose plugin (only for the local database)
- Git

### Project Structure

```
BITSmegle/
├── src/                 # Frontend (SvelteKit)
├── server/             # Backend (Express.js + Socket.IO)
├── scripts/            # Database setup and smoke-test scripts
└── README.md
```

## Local Database Setup (MongoDB)

`docker-compose.dev.yml` runs a MongoDB 7 instance for development, separate
from the production stack in `docker-compose.yml`. From the repo root:

```bash
npm run db:up      # start MongoDB and wait until it is healthy
npm run db:seed    # create indexes and insert sample users
npm run db:test    # verify every database operation the app performs
```

Then point both `.env` files at it:

```
DB_URI=mongodb://127.0.0.1:27017/bitsmegle
```

The database name in that URI is not optional — `src/db/mongo.ts` calls
`client.db()` with no argument, so it is read from the URI path.

| Command            | What it does                                                  |
| ------------------ | ------------------------------------------------------------- |
| `npm run db:up`    | Start MongoDB on `127.0.0.1:27017`                            |
| `npm run db:down`  | Stop it, keeping data in the `mongo-data` volume              |
| `npm run db:reset` | Delete the volume and start over with a fresh seeded database |
| `npm run db:setup` | Create the indexes only (no sample data)                      |
| `npm run db:seed`  | Create the indexes and insert sample users                    |
| `npm run db:test`  | Run the end-to-end database smoke test                        |
| `npm run db:shell` | Open `mongosh` inside the container                           |
| `npm run db:logs`  | Tail the MongoDB logs                                         |

Data lives in the `mongo-data` Docker volume and survives `db:down` and
restarts; `npm run db:reset` is the only command that discards it.

The instance runs without authentication and is bound to loopback, so it is
reachable only from this machine. Set `MONGO_PORT` if 27017 is already taken.

For a browser UI over the data, start the optional `mongo-express` profile and
open `http://localhost:8081`:

```bash
docker compose -f docker-compose.dev.yml --profile ui up -d
```

## Frontend Setup (SvelteKit)

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Configuration

Create `.env` file in root directory after copying `.env.example`

### 3. Start Development Server

```bash
npm run dev
```

The frontend will be available at `http://localhost:5173`

## Backend Setup (Express.js)

### 1. Navigate to Server Directory

```bash
cd server
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Configuration

Create `.env` file in `server` directory following the `.env.example`

### 4. Start Development Server

```bash
npm run dev
```

The backend will be available at `http://localhost:3000`

## 📝 API Endpoints

### Authentication

- `POST /api/oauth` - Google OAuth login
- `POST /api/users` - Verify user session

### User Management

- `GET /api/users/:id` - Get user profile
- `POST /api/rep` - Update user reputation

### Statistics

- `GET /stats` - Server health check

## Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature-name`
3. Commit changes: `git commit -m 'Add feature'`
4. Push to branch: `git push origin feature-name`
5. Submit pull request
