Owner Trading deployment notes

This folder contains helper files and example commands for deploying the Owner Trading app on an Ubuntu server.

1) Build the frontend (on the server or CI)

    cd frontend
    # If using yarn
    yarn install --frozen-lockfile
    yarn build
    # Or npm
    npm ci
    npm run build

2) Install the Nginx server block

    sudo cp deploy/nginx/owner-trading.conf /etc/nginx/sites-available/owner-trading
    sudo ln -s /etc/nginx/sites-available/owner-trading /etc/nginx/sites-enabled/
    sudo nginx -t
    sudo systemctl reload nginx

3) Install the backend systemd service

    # Place the service unit and enable it
    sudo cp deploy/systemd/owner-trading.service /etc/systemd/system/owner-trading.service
    sudo systemctl daemon-reload
    # Supply environment variables via /home/ubuntu/owner-trading/backend/.env or systemd EnvironmentFile
    sudo systemctl enable --now owner-trading

4) Firewall (ufw) and SSL (optional)

    sudo ufw allow 'Nginx Full'
    sudo ufw enable

    # For TLS with certbot (recommended)
    sudo apt install certbot python3-certbot-nginx
    sudo certbot --nginx -d your.domain.example

5) Verify

    # From a remote host
    curl -I http://your.server/
    curl -s http://127.0.0.1:8000/api/health | jq

Notes

- Adjust `User`/`Group` and `WorkingDirectory` in the systemd unit to match your server account and virtualenv location.
- Replace `/home/ubuntu/owner-trading/.venv/bin` with your actual virtualenv path if different.
- Keep secrets out of the repository; provide production secrets via a secure mechanism (Env file with restricted permissions, or a secret manager).
