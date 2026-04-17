# Frontend Setup Guide

The active frontend is the React app in `frontend/`.

## Setup

```bash
cd frontend
cp .env.example .env 2>/dev/null || true
npm install
npm start
```

The development server runs on `http://localhost:3000`.

## Backend Dependency

The frontend expects the backend API at:

```javascript
http://localhost:5000/api
```

Start the backend first if you want live dashboard data.

## Main Frontend Files

```text
frontend/
├── public/
├── src/
│   ├── components/
│   │   ├── Controller.js
│   │   ├── Dashboard.js
│   │   ├── IDSAlerts.js
│   │   ├── Navigation.js
│   │   ├── Topology.js
│   │   └── TrafficAnalysis.js
│   ├── services/api.js
│   ├── App.js
│   └── App.css
├── package.json
└── .env.example
```

## Available Scripts

- `npm start` starts the development server
- `npm run build` creates a production build in `build/`
- `npm test` runs the test command provided by Create React App

## Common Issues

### Blank Page

```bash
rm -rf node_modules package-lock.json
npm install
npm start
```

### API Requests Failing

```bash
curl http://localhost:5000/api/health
```

If that fails, start the backend from `backend/` with:

```bash
python app.py
```
4. **Real-time Updates**: Use WebSockets for live data
5. **Dark Mode**: Add dark theme toggle
6. **User Authentication**: Add login functionality
7. **Export Data**: Implement CSV/PDF export
8. **Notifications**: Add toast notifications for events

---

**Last Updated**: April 2026
