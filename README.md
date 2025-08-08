# BITSmegle

A real-time video chat platform that connects BITS Pilani students randomly for conversations, built with SvelteKit, Express.js and WebRTC.

## Quick Setup Guide

### Prerequisites

- Node.js 18+
- MongoDB (local or Atlas)
- Git

### Project Structure

```
BITSmegle/
├── src/                 # Frontend (SvelteKit)
├── server/             # Backend (Express.js + Socket.IO)
└── README.md
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
