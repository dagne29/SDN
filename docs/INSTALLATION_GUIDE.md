# Installation Guide

## Requirements

- Python 3.8+
- Node.js 14+
- npm

## Backend Setup

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
python app.py
```

Backend runs on `http://localhost:5000`.

Verify it:

```bash
curl http://localhost:5000/api/health
```

## Frontend Setup

Open a new terminal:

```bash
cd frontend
cp .env.example .env 2>/dev/null || true
npm install
npm start
```

Frontend runs on `http://localhost:3000`.

## Ryu Controller

From the controller directory:

```bash
cd ryu_controller
EVENTLET_NO_GREENDNS=yes ryu-manager simple_switch.py
```

If `ryu-manager` is only available inside your Python environment, activate that environment first.

## Recommended Run Order

1. Start `backend/app.py`
2. Start `frontend`
3. Start the Ryu controller if you are using Mininet and OpenFlow switching

## Common Issues

### Backend not reachable

```bash
curl http://localhost:5000/api/health
```

If it fails, restart the Flask app from `backend/`.

### Frontend dependency issues

```bash
rm -rf node_modules package-lock.json
npm install
npm start
```

### Port already in use

```bash
lsof -i :5000
lsof -i :3000
```
