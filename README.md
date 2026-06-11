# Brototype Python Playground — Phase 1 MVP

A clean, responsive, mobile-first web application designed as a gated Python compiler to serve as a lead-generation tool for **Brototype**. Visitors must register or log in using an international WhatsApp OTP to unlock the browser-based client-side Python execution environment.

---

## Technical Architecture

- **Frontend:** Static HTML5, CSS3, and Vanilla JS, serving client-side Python compilation fully isolated inside a Web Worker using **Pyodide (WebAssembly)**. Suitable for instant deployment to Cloudflare Pages.
- **Backend:** Express.js REST API using the official MongoDB Node.js driver.
- **Database:** MongoDB Atlas (or local MongoDB Community edition).

---

## Prerequisites

Ensure you have the following installed on your machine:
- **Node.js** (v18 or higher recommended)
- **NPM** (v9 or higher)
- **MongoDB** (Local Community Edition or a free Atlas M0 Cluster)

---

## Environment Configuration

Copy the `.env.example` file to `/backend/.env` and configure your variables:

```bash
cp .env.example backend/.env
```

### Required Keys

| Environment Variable | Description | Example / Recommended Value |
| :--- | :--- | :--- |
| `MONGODB_URI` | MongoDB Connection String | `mongodb://127.0.0.1:27017/python_playground` (Local) |
| `WATI_API_KEY` | WATI WhatsApp API Access Token | Use `mock` for local console logs testing, or standard WATI token |
| `WATI_BASE_URL` | WATI Base API Endpoint | `https://api.wati.io` |
| `WATI_OTP_TEMPLATE` | WATI WhatsApp OTP template name | `otp_verification` |
| `CRM_WEBHOOK_URL` | Lead injection CRM webhook POST URL | Use `mock` for local logging, or actual target webhook |
| `SESSION_SIGNING_KEY`| Secret to sign client verification JWTs | Keep this a long random secure string |
| `ADMIN_SESSION_KEY`  | Secret to sign super-admin JWTs | Keep this distinct from USER_SESSION_KEY |
| `OTP_TTL_SECONDS`    | Expiry threshold for 6-digit OTP codes | `300` (5 minutes) |
| `OTP_MAX_ATTEMPTS`   | Max verification guesses allowed per code | `5` |

---

## Database Setup

### 1. MongoDB Atlas Free Cluster (Alternative to local MongoDB)
1. Sign up for a free account at [mongodb.com/atlas](https://www.mongodb.com/cloud/atlas/register).
2. Create a new Shared Cluster on the Free M0 tier.
3. In **Network Access**, whitelist your IP or allow access from anywhere (`0.0.0.0/0`) if deploying to Cloudflare.
4. Under **Database Access**, create a user (e.g. `brototype_user`) with Read/Write permissions.
5. Click **Connect** -> **Drivers** and copy the connection string.
6. Replace `<password>` with your database user password and update `MONGODB_URI` in `backend/.env`.

---

## Run Locally

### 1. Backend API
Install dependencies and run startup script:

```bash
cd backend
npm install
npm start
```
*Note: The server will automatically connect to MongoDB, perform check indexes, and seed lessons + a super-admin account on initial launch if collections are empty.*

**Seeded Super-Admin Credentials:**
- **Email:** `admin@brototype.com`
- **Password:** `adminpassword123`

### 2. Frontend Server
In a new terminal window, start a static web server from the project root directory:

```bash
# Serves static files on port 8080
python3 -m http.server 8080 --directory ./frontend
```
Now navigate to [http://localhost:8080](http://localhost:8080) to interact with the app.

---

## Mock/Local Testing Guide

1. With `WATI_API_KEY=mock`, filling out the signup form triggers a yellow warning toast in the browser displaying the generated mock verification code.
2. The OTP code is also logged in the backend console output.
3. On verification, the lead payload will log to the console (with `CRM_WEBHOOK_URL=mock`) instead of posting, saving it with state `succeeded` in the push queue.
4. Navigate to [http://localhost:8080/admin.html](http://localhost:8080/admin.html) to log in as the admin and manage the registry.

---

## Deployment Instructions

### 1. Frontend: Deploying to Cloudflare Pages
1. Log in to your Cloudflare Dashboard and select **Pages**.
2. Click **Create a project** -> **Connect to Git** or upload the folder directly.
3. Select the `frontend` folder as the root directory.
4. Skip the build command settings (since it's a static site).
5. Deploy. Modify `API_BASE_URL` inside `frontend/app.js` to point to your live backend service before deploy.

### 2. Backend: Deploying to a Node Host (Render, Heroku, or VPS)
1. Commit the `backend` folder into your repository.
2. Link the repository to your host of choice.
3. Set the required environment secrets (listed in the table above) in the host's settings panel.
4. Set the Start Command to `npm start` (which runs `node server.js`).
