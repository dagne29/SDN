# SDN Traffic Analysis and IDS

This project is a demo SDN monitoring stack with:

- a React frontend in `frontend/`
- a Flask backend simulator in `backend/`
- a Ryu controller app in `ryu_controller/`
- a Mininet topology script in `mininet_topology/`

## Project Structure

```text
SDN/
├── backend/              # Flask API and simulated network state
├── docs/                 # Setup and API documentation
├── frontend/             # React dashboard
├── mininet_topology/     # Mininet topology script
└── ryu_controller/       # Ryu controller application
```

## Quick Start

### 1. Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python app.py
```

Backend runs on `http://localhost:5000`.

### 2. Frontend

```bash
cd frontend
npm install
npm start
```

Frontend runs on `http://localhost:3000`.

### 3. Ryu Controller

From `ryu_controller/`, start the controller with:

```bash
EVENTLET_NO_GREENDNS=yes ryu-manager simple_switch.py
```

Use your Ryu environment if `ryu-manager` is not on your path.

## Notes

- The active backend is `backend/app.py`.
- The active controller is `ryu_controller/simple_switch.py`.
- Build artifacts, local virtual environments, and editor files are intentionally ignored.

## Documentation

- `docs/INSTALLATION_GUIDE.md`
- `docs/FRONTEND_SETUP.md`
- `docs/API_DOCUMENTATION.md`
- `backend/BACKEND_SETUP.md`
